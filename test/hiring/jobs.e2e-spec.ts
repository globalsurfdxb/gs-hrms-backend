import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Agent = Awaited<ReturnType<typeof signInAs>>;
type Who = keyof typeof PERSONA;

/* Jobs (hiring step 2): created from an approved requisition, status along the state diagram, recruiter hand-over
   to the Talent Acquisition Manager (BR-HIR-021; the seed has one, GS-155), History tab, and access. */
describe('Jobs API', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as: Record<Who, Agent> = {} as never;
  const id: Record<Who, string> = {} as never;
  let ref: { companyId: string; departmentId: string; designationId: string; otherDesignationId: string };

  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const send = (who: Who, method: 'post' | 'put', path: string, body?: object) =>
    as[who][method](`/api/hiring${path}`).set('Origin', ORIGIN).send(body);
  const jobBody = (patch: Record<string, unknown> = {}) => ({
    description: 'Design, deploy and support client networks.',
    skills: ['Cisco', 'SD-WAN'],
    expMin: 2,
    expMax: 6,
    qualifications: 'CCNA or higher',
    panelIds: [id.teamLead],
    closingDate: future(30),
    ...patch,
  });

  /** A requisition walked through the whole chain: Team Lead raises, HR and Super Admin approve. */
  async function approvedRequisition(positions = 2): Promise<{ id: string; code: string }> {
    const r = await send('teamLead', 'post', '/requisitions', {
      title: 'Network Engineer',
      companyId: ref.companyId,
      departmentId: ref.departmentId,
      designationId: ref.designationId,
      locationId: 'Dubai',
      positions,
      employmentType: 'FULL_TIME',
      reason: 'NEW_ROLE',
      budgetMin: '9000',
      budgetMax: '12000',
      targetStart: future(60),
      hiringManagerId: id.teamLead,
      justification: 'New managed-network clients.',
      submit: true,
    }).expect(201);
    await send('hr', 'post', `/requisitions/${r.body.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await send('superAdmin', 'post', `/requisitions/${r.body.id}/decision`, { decision: 'APPROVED' }).expect(200);
    return { id: r.body.id, code: r.body.code };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const key of Object.keys(PERSONA) as Who[]) {
      as[key] = await signInAs(app, PERSONA[key]);
      id[key] = (await as[key].get('/api/auth/me').expect(200)).body.employeeId;
    }
    const gsit = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    const dept = await prisma.department.findUniqueOrThrow({
      where: { companyId_name: { companyId: gsit.id, name: 'Cloud & Infra' } },
      include: { designations: true },
    });
    const hrDept = await prisma.department.findUniqueOrThrow({
      where: { companyId_name: { companyId: gsit.id, name: 'HR' } },
      include: { designations: true },
    });
    ref = {
      companyId: gsit.id,
      departmentId: dept.id,
      designationId: dept.designations[0].id,
      otherDesignationId: hrDept.designations[0].id,
    };
  });
  afterAll(() => app.close());

  it('creates a job from an approved requisition, once, and links it back', async () => {
    const req = await approvedRequisition();
    const before = await as.hr.get(`/api/hiring/requisitions/${req.id}`).expect(200);
    expect(before.body).toMatchObject({ job: null, viewer: { canCreateJob: true } });

    const res = await send(
      'hr',
      'post',
      `/requisitions/${req.id}/job`,
      jobBody({ skills: ['Cisco', ' cisco ', 'SD-WAN'] }),
    );
    expect(res.status).toBe(201);
    const job = res.body;
    expect(job.code).toMatch(/^JOB-\d{4,}$/);
    expect(job).toMatchObject({
      status: 'DRAFT',
      title: 'Network Engineer',
      positions: 2,
      filled: 0,
      skills: ['Cisco', 'SD-WAN'],
      requisition: { id: req.id, code: req.code },
      hiringManager: { id: id.teamLead },
      recruiter: null,
      taManager: { id: id.taManager },
      budgetMax: { amount: '12000.00', currency: 'AED' },
      designation: { id: ref.designationId },
      viewer: { actions: ['open'], canChangeRecruiter: false },
    });
    expect(job.history.map((h: { text: string }) => h.text)).toEqual([
      `Job created from ${req.code} as Draft`,
      'Handed to Dev TA Manager (Talent Acquisition Manager) to choose the recruiter',
    ]);

    const after = await as.hr.get(`/api/hiring/requisitions/${req.id}`).expect(200);
    expect(after.body).toMatchObject({
      job: { id: job.id, code: job.code, status: 'DRAFT' },
      viewer: { canCreateJob: false },
    });

    const again = await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(409);
    expect(again.body.code).toBe('job.already_exists');
    const audit = await prisma.auditLog.findMany({ where: { entityType: 'job', entityId: job.id } });
    expect(audit.map((a) => a.action).sort()).toEqual(['job.created', 'job.handed_over']);
  });

  it('refuses a requisition that is not approved, or unknown', async () => {
    const draft = await send('hr', 'post', '/requisitions', {
      title: 'Draft only',
      companyId: ref.companyId,
      departmentId: ref.departmentId,
      locationId: 'Dubai',
      positions: 1,
      employmentType: 'CONTRACT',
      reason: 'NEW_ROLE',
      budgetMin: '5000',
      budgetMax: '6000',
      targetStart: future(60),
      hiringManagerId: id.teamLead,
      justification: 'Test',
    }).expect(201);
    const res = await send('hr', 'post', `/requisitions/${draft.body.id}/job`, jobBody()).expect(409);
    expect(res.body.code).toBe('job.requisition_not_approved');
    await send('hr', 'post', `/requisitions/${randomUUID()}/job`, jobBody()).expect(404);
  });

  it('validates the job input (BR-HIR-005)', async () => {
    const req = await approvedRequisition();
    const code = async (patch: Record<string, unknown>) =>
      (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody(patch)).expect(400)).body.code;
    expect(await code({ panelIds: [id.teamLead, randomUUID()] })).toBe('job.invalid_panel');
    expect(await code({ expMin: 6, expMax: 2 })).toBe('job.invalid_experience');
    expect(await code({ designationId: ref.otherDesignationId })).toBe('job.designation_mismatch');
    expect(await code({ skills: [] })).toBe('request.invalid');
    expect(await code({ status: 'FILLED' })).toBe('request.invalid');
    expect(await code({ filled: 2 })).toBe('request.invalid');
  });

  it('moves along the state diagram and keeps the History tab (BR-HIR-006)', async () => {
    const req = await approvedRequisition(1);
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody({ publish: true })).expect(201)).body;
    expect(job).toMatchObject({ status: 'OPEN', viewer: { actions: ['hold', 'close'] } });

    await send('hr', 'post', `/jobs/${job.id}/open`).expect(409);
    expect((await send('hr', 'post', `/jobs/${job.id}/hold`).expect(200)).body.status).toBe('ON_HOLD');
    expect((await send('superAdmin', 'post', `/jobs/${job.id}/resume`).expect(200)).body.status).toBe('OPEN');
    expect((await send('hr', 'post', `/jobs/${job.id}/close`).expect(200)).body.status).toBe('CLOSED');
    const reopened = await send('hr', 'post', `/jobs/${job.id}/reopen`).expect(200);
    expect(reopened.body.history.map((h: { text: string }) => h.text)).toEqual([
      `Job created from ${req.code} as Open`,
      'Handed to Dev TA Manager (Talent Acquisition Manager) to choose the recruiter',
      'Status changed from Open to On Hold',
      'Status changed from On Hold to Open',
      'Status changed from Open to Closed',
      'Status changed from Closed to Open',
    ]);

    // Every position filled (set by offers in step 5): a closed job cannot be reopened.
    await send('hr', 'post', `/jobs/${job.id}/close`).expect(200);
    await prisma.job.update({ where: { id: job.id }, data: { filled: 1 } });
    const full = await send('hr', 'post', `/jobs/${job.id}/reopen`).expect(409);
    expect(full.body.code).toBe('job.no_open_positions');
  });

  it('keeps the History tab append-only in the database, and a job with history cannot be deleted', async () => {
    const req = await approvedRequisition();
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(201)).body;
    const where = { jobId: job.id };
    await expect(prisma.jobEvent.updateMany({ where, data: { text: 'rewritten' } })).rejects.toThrow(/append-only/);
    await expect(prisma.jobEvent.deleteMany({ where })).rejects.toThrow(/append-only/);
    await expect(prisma.job.delete({ where: { id: job.id } })).rejects.toThrow();
    expect(await prisma.jobEvent.count({ where })).toBe(2);
  });

  it('hands a job made by HR to the TA Manager, who chooses the recruiter from the team (BR-HIR-021)', async () => {
    const req = await approvedRequisition();
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(201)).body;
    expect(job).toMatchObject({ recruiter: null, taManager: { id: id.taManager } });

    const waiting = await as.taManager.get('/api/hiring/jobs?awaitingRecruiter=true&pageSize=100').expect(200);
    expect(waiting.body.items.map((j: { id: string }) => j.id)).toContain(job.id);
    expect(waiting.body.items.every((j: { recruiter: unknown }) => j.recruiter === null)).toBe(true);

    const hr = await send('hr', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.recruiter }).expect(403);
    expect(hr.body.code).toBe('job.recruiter_not_allowed');
    const outsider = await send('taManager', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.hr }).expect(400);
    expect(outsider.body.code).toBe('job.invalid_recruiter');
    await send('taManager', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: randomUUID() }).expect(400);

    const chosen = await send('taManager', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.recruiter });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toMatchObject({ recruiter: { id: id.recruiter }, viewer: { canChangeRecruiter: true } });
    expect(chosen.body.history.at(-1).text).toBe('Dev Recruiter chosen as the recruiter');

    const same = await send('taManager', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.recruiter });
    expect(same.body.history).toHaveLength(3);
    const changed = await send('superAdmin', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.taManager });
    expect(changed.status).toBe(200);
    expect(changed.body.history.at(-1).text).toBe('Recruiter changed from Dev Recruiter to Dev TA Manager');

    const audit = await prisma.auditLog.findMany({ where: { entityType: 'job', entityId: job.id } });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'job.created',
      'job.handed_over',
      'job.recruiter_changed',
      'job.recruiter_chosen',
    ]);

    const byRecruiter = await as.hr.get(`/api/hiring/jobs?recruiterId=${id.taManager}&pageSize=100`).expect(200);
    expect(byRecruiter.body.items.map((j: { id: string }) => j.id)).toContain(job.id);
  });

  it('refuses a recruiter on a handed-over job, and requires one when the TA Manager creates it', async () => {
    const req = await approvedRequisition();
    const sent = await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody({ recruiterId: id.recruiter }));
    expect(sent.status).toBe(400);
    expect(sent.body.code).toBe('job.recruiter_chosen_by_ta');

    const none = await send('taManager', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(400);
    expect(none.body.code).toBe('job.recruiter_required');
    const outsider = await send('taManager', 'post', `/requisitions/${req.id}/job`, jobBody({ recruiterId: id.hr }));
    expect(outsider.body.code).toBe('job.invalid_recruiter');

    const job = await send('taManager', 'post', `/requisitions/${req.id}/job`, jobBody({ recruiterId: id.recruiter }));
    expect(job.status).toBe(201);
    expect(job.body).toMatchObject({ recruiter: { id: id.recruiter }, taManager: { id: id.taManager } });
    expect(job.body.history).toHaveLength(1);

    const other = await approvedRequisition();
    const bySa = await send(
      'superAdmin',
      'post',
      `/requisitions/${other.id}/job`,
      jobBody({ recruiterId: id.recruiter }),
    );
    expect(bySa.status).toBe(201);
    expect(bySa.body.history).toHaveLength(1);
  });

  it('keeps a job without a recruiter tied to a TA Manager in the database', async () => {
    const req = await approvedRequisition();
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(201)).body;
    await expect(prisma.job.update({ where: { id: job.id }, data: { taManagerId: null } })).rejects.toThrow(
      /jobs_recruiter_or_ta_manager_chk/,
    );
  });

  it('tells the job form who the TA Manager is, whether a new job goes to them, and the team to choose from', async () => {
    const hr = await as.hr.get('/api/hiring/recruiters').expect(200);
    expect(hr.body).toMatchObject({ taManager: { id: id.taManager }, handsOver: true });
    const pool = hr.body.pool.map((p: { id: string }) => p.id);
    expect(pool).toEqual(expect.arrayContaining([id.taManager, id.recruiter]));
    expect(pool).not.toContain(id.hr);
    expect((await as.taManager.get('/api/hiring/recruiters').expect(200)).body.handsOver).toBe(false);
    expect((await as.superAdmin.get('/api/hiring/recruiters').expect(200)).body.handsOver).toBe(false);
    for (const who of ['teamLead', 'officeAdmin', 'employee'] as Who[]) {
      await as[who].get('/api/hiring/recruiters').expect(403);
    }
  });

  it.each(['teamLead', 'officeAdmin', 'employee'] as Who[])('gives %s no access to jobs', async (who) => {
    const req = await approvedRequisition();
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(201)).body;
    await as[who].get('/api/hiring/jobs').expect(403);
    await as[who].get(`/api/hiring/jobs/${job.id}`).expect(403);
    await send(who, 'post', `/jobs/${job.id}/open`).expect(403);
    await send(who, 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id[who] }).expect(403);
    const other = await approvedRequisition();
    await send(who, 'post', `/requisitions/${other.id}/job`, jobBody()).expect(403);
  });
});
