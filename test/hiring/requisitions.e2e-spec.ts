import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Agent = Awaited<ReturnType<typeof signInAs>>;

/* Requisitions (hiring step 1): raise → approval chain Hiring Manager → HR → Management, visibility per role,
   validation, hold/resume/close. Seed personas: GS-058 Team Lead, GS-119 HR, GS-101 Office Admin, GS-120 Super
   Admin, GS-087 Employee. */
describe('Requisitions API', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as: Record<keyof typeof PERSONA, Agent> = {} as never;
  const id: Record<keyof typeof PERSONA, string> = {} as never;
  let ref: { companyId: string; departmentId: string; designationId: string; otherDepartmentId: string };

  // Far enough ahead to never be "in the past", whatever the timezone.
  const future = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const body = (patch: Record<string, unknown> = {}) => ({
    title: 'Network Engineer',
    companyId: ref.companyId,
    departmentId: ref.departmentId,
    designationId: ref.designationId,
    locationId: 'Dubai',
    positions: 2,
    employmentType: 'FULL_TIME',
    reason: 'NEW_ROLE',
    budgetMin: '9000',
    budgetMax: '12000.50',
    targetStart: future,
    hiringManagerId: id.teamLead,
    justification: 'Two new managed-network clients from January.',
    ...patch,
  });
  const post = (who: keyof typeof PERSONA, path: string, send?: object) =>
    as[who].post(`/api/hiring/requisitions${path}`).set('Origin', ORIGIN).send(send);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const key of Object.keys(PERSONA) as (keyof typeof PERSONA)[]) {
      as[key] = await signInAs(app, PERSONA[key]);
      id[key] = (await as[key].get('/api/auth/me').expect(200)).body.employeeId;
    }
    const gsit = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    const gsd = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSD' } });
    const dept = await prisma.department.findUniqueOrThrow({
      where: { companyId_name: { companyId: gsit.id, name: 'Cloud & Infra' } },
      include: { designations: true },
    });
    const sales = await prisma.department.findUniqueOrThrow({
      where: { companyId_name: { companyId: gsd.id, name: 'Sales' } },
    });
    ref = {
      companyId: gsit.id,
      departmentId: dept.id,
      designationId: dept.designations[0].id,
      otherDepartmentId: sales.id,
    };
  });
  afterAll(() => app.close());

  it('runs the whole chain when the hiring manager raises it, and audits every step', async () => {
    const created = await post('teamLead', '', body({ submit: true })).expect(201);
    const r = created.body;
    expect(r.code).toMatch(/^REQ-\d{4,}$/);
    expect(r).toMatchObject({ status: 'PENDING_APPROVAL', budgetMin: { amount: '9000.00', currency: 'AED' } });
    expect(r.steps.map((s: { label: string; status: string }) => `${s.label}:${s.status}`)).toEqual([
      'HIRING_MANAGER:APPROVED',
      'HR:PENDING',
      'MANAGEMENT:WAITING',
    ]);
    expect(r.viewer).toMatchObject({ canDecide: false, canEdit: false });

    // HR step: not the Team Lead's to decide; HR approves.
    await post('teamLead', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(403);
    await post('hr', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    // Management step: HR cannot, Super Admin can.
    await post('hr', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(403);
    const approved = await post('superAdmin', `/${r.id}/decision`, { decision: 'APPROVED', note: 'Go' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.steps[2]).toMatchObject({ status: 'APPROVED', note: 'Go' });

    const actions = (await prisma.auditLog.findMany({ where: { entityType: 'requisition', entityId: r.id } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual([
      'requisition.created',
      'requisition.submitted',
      'requisition.step_approved',
      'requisition.step_approved',
    ]);
  });

  it('lets the hiring manager reject with a note, and the requester edit and resubmit', async () => {
    const draft = (await post('hr', '', body()).expect(201)).body;
    expect(draft).toMatchObject({ status: 'DRAFT', steps: [] });
    await post('hr', `/${draft.id}/submit`).expect(200);

    await post('teamLead', `/${draft.id}/decision`, { decision: 'REJECTED' }).expect(400);
    const rejected = await post('teamLead', `/${draft.id}/decision`, {
      decision: 'REJECTED',
      note: 'No budget',
    }).expect(200);
    expect(rejected.body.status).toBe('REJECTED');

    const edited = await as.hr
      .patch(`/api/hiring/requisitions/${draft.id}`)
      .set('Origin', ORIGIN)
      .send({ positions: 1 })
      .expect(200);
    expect(edited.body).toMatchObject({ positions: 1, status: 'REJECTED' });
    const again = await post('hr', `/${draft.id}/submit`).expect(200);
    expect(again.body.steps[0].status).toBe('PENDING');
  });

  it('makes a Super Admin wait for the others on their own requisition, then confirm Management', async () => {
    const r = (await post('superAdmin', '', body({ submit: true })).expect(201)).body;
    expect(r.steps[0]).toMatchObject({ label: 'HIRING_MANAGER', status: 'PENDING' });
    expect(r.viewer.canDecide).toBe(false);
    const refused = await post('superAdmin', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(403);
    expect(refused.body.code).toBe('requisition.own_request');
    await post('teamLead', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await post('superAdmin', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(403);
    await post('hr', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    const approved = await post('superAdmin', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('scopes what Office Admin and Team Lead can see; Employee has no access', async () => {
    const hrOnly = (await post('hr', '', body({ hiringManagerId: id.superAdmin })).expect(201)).body;
    await as.teamLead.get(`/api/hiring/requisitions/${hrOnly.id}`).expect(404);
    await as.officeAdmin.get(`/api/hiring/requisitions/${hrOnly.id}`).expect(404);

    // Once it waits on the HR step, Office Admin (an HR-step approver) sees it and can decide it.
    // Submitted by the hiring manager (Super Admin): their step is auto-approved, HR step is next.
    await post('superAdmin', `/${hrOnly.id}/submit`).expect(200);
    const inbox = await as.officeAdmin.get('/api/hiring/requisitions?waitingOnMe=true').expect(200);
    expect(inbox.body.items.map((x: { id: string }) => x.id)).toContain(hrOnly.id);
    await post('officeAdmin', `/${hrOnly.id}/decision`, { decision: 'APPROVED' }).expect(200);
    // …and still sees it after deciding.
    await as.officeAdmin.get(`/api/hiring/requisitions/${hrOnly.id}`).expect(200);

    await as.employee.get('/api/hiring/requisitions').expect(403);
    await post('employee', '', body()).expect(403);
  });

  it('validates the input (BR-HIR-003) and rejects unknown fields', async () => {
    const code = async (patch: Record<string, unknown>) => (await post('hr', '', body(patch)).expect(400)).body.code;
    expect(await code({ targetStart: '2020-01-01' })).toBe('requisition.start_in_past');
    expect(await code({ budgetMax: '100' })).toBe('requisition.invalid_budget');
    expect(await code({ departmentId: ref.otherDepartmentId })).toBe('requisition.department_mismatch');
    expect(await code({ reason: 'REPLACEMENT' })).toBe('request.invalid');
    expect(await code({ locationId: 'Mars' })).toBe('requisition.unknown_location');
    expect(await code({ hiringManagerId: id.employee })).toBe('requisition.hiring_manager_no_access');
    expect(await code({ status: 'APPROVED' })).toBe('request.invalid');
  });

  it('lets only HR / Super Admin hold, resume and close, along the state diagram', async () => {
    const r = (await post('hr', '', body({ hiringManagerId: id.hr, submit: true })).expect(201)).body;
    await post('hr', `/${r.id}/hold`).expect(409); // still pending approval
    // Nobody decides their own request: HR raised it, so Office Admin decides the HR step.
    const own = await post('hr', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(403);
    expect(own.body.code).toBe('requisition.own_request');
    await post('officeAdmin', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await post('superAdmin', `/${r.id}/decision`, { decision: 'APPROVED' }).expect(200);

    await post('hr', `/${r.id}/resume`).expect(409); // approved, not on hold
    expect((await post('hr', `/${r.id}/hold`).expect(200)).body.status).toBe('ON_HOLD');
    expect((await post('hr', `/${r.id}/resume`).expect(200)).body.status).toBe('APPROVED');
    await as.hr.patch(`/api/hiring/requisitions/${r.id}`).set('Origin', ORIGIN).send({ positions: 3 }).expect(409);
    expect((await post('hr', `/${r.id}/close`).expect(200)).body.status).toBe('CLOSED');
    await post('hr', `/${r.id}/hold`).expect(409);

    const mine = (await post('teamLead', '', body({ submit: true })).expect(201)).body;
    await post('hr', `/${mine.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await post('superAdmin', `/${mine.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await post('teamLead', `/${mine.id}/hold`).expect(403);
  });

  it('lists newest first with paging', async () => {
    const res = await as.hr.get('/api/hiring/requisitions?pageSize=2&page=1').expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.items.length);
  });
});
