import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Agent = Awaited<ReturnType<typeof signInAs>>;
type Who = keyof typeof PERSONA;

/* Jobs (hiring step 2): created from an approved requisition, status along the state diagram, recruiter changes,
   History tab, and access for HR / Super Admin only. */
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
    recruiterId: id.hr,
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
      recruiter: { id: id.hr },
      budgetMax: { amount: '12000.00', currency: 'AED' },
      designation: { id: ref.designationId },
      viewer: { actions: ['open'], canChangeRecruiter: true },
    });
    expect(job.history.map((h: { text: string }) => h.text)).toEqual([`Job created from ${req.code} as Draft`]);

    const after = await as.hr.get(`/api/hiring/requisitions/${req.id}`).expect(200);
    expect(after.body).toMatchObject({
      job: { id: job.id, code: job.code, status: 'DRAFT' },
      viewer: { canCreateJob: false },
    });

    const again = await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(409);
    expect(again.body.code).toBe('job.already_exists');
    const audit = await prisma.auditLog.findMany({ where: { entityType: 'job', entityId: job.id } });
    expect(audit.map((a) => a.action)).toEqual(['job.created']);
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
    expect(await code({ recruiterId: randomUUID() })).toBe('job.invalid_recruiter');
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
    expect(await prisma.jobEvent.count({ where })).toBe(1);
  });

  it('changes the recruiter and records it', async () => {
    const req = await approvedRequisition();
    const job = (await send('hr', 'post', `/requisitions/${req.id}/job`, jobBody()).expect(201)).body;
    const changed = await send('hr', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.officeAdmin }).expect(200);
    expect(changed.body.recruiter.id).toBe(id.officeAdmin);
    expect(changed.body.history.at(-1).text).toBe('Recruiter changed from Dev HR to Dev Office Admin');

    const same = await send('hr', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: id.officeAdmin }).expect(200);
    expect(same.body.history).toHaveLength(2);
    await send('hr', 'put', `/jobs/${job.id}/recruiter`, { recruiterId: randomUUID() }).expect(400);

    const list = await as.hr.get(`/api/hiring/jobs?recruiterId=${id.officeAdmin}&status=DRAFT`).expect(200);
    expect(list.body.items.map((j: { id: string }) => j.id)).toContain(job.id);
    expect(list.body.items.every((j: { recruiter: { id: string } }) => j.recruiter.id === id.officeAdmin)).toBe(true);
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
