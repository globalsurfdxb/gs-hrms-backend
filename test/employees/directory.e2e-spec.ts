import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, PERSONA, signInAs } from '../app.js';

/* Data scopes on the employee directory (core/iam/data-scope.ts): Directory → View sees everyone, Team → Directory
   sees self + direct reports, anyone else sees only themselves. Out of scope is a 404 that reveals nothing.
   Seeded reporting lines: GS-087 → GS-058 → GS-120; GS-156 → GS-155 → GS-120. */
describe('Employee directory data scopes', () => {
  let app: INestApplication<App>;
  const as: Record<keyof typeof PERSONA, Awaited<ReturnType<typeof signInAs>>> = {} as never;

  type Item = { employeeCode: string; reportingManager: { employeeCode: string } | null };
  const codes = (res: { body: { items: Item[] } }) => res.body.items.map((i) => i.employeeCode);

  beforeAll(async () => {
    app = await createTestApp();
    for (const [k, code] of Object.entries(PERSONA)) as[k as keyof typeof PERSONA] = await signInAs(app, code);
  });
  afterAll(() => app.close());

  it.each(['superAdmin', 'hr', 'officeAdmin'] as const)('%s sees everyone', async (who) => {
    const res = await as[who].get('/api/employees?pageSize=100').expect(200);
    expect(res.body.scope).toBe('ALL');
    expect(codes(res)).toEqual(expect.arrayContaining(Object.values(PERSONA)));
    expect(res.body.total).toBeGreaterThanOrEqual(Object.values(PERSONA).length);
  });

  it('a Team Lead sees themselves and their direct reports only', async () => {
    const res = await as.teamLead.get('/api/employees?pageSize=100').expect(200);
    expect(res.body.scope).toBe('TEAM');
    expect(codes(res)).toEqual(expect.arrayContaining([PERSONA.teamLead, PERSONA.employee]));
    expect(codes(res)).not.toContain(PERSONA.superAdmin);
    const others = (res.body.items as Item[]).filter((i) => i.employeeCode !== PERSONA.teamLead);
    expect(others.every((i) => i.reportingManager?.employeeCode === PERSONA.teamLead)).toBe(true);

    await as.teamLead.get(`/api/employees/${PERSONA.employee}`).expect(200);
    const out = await as.teamLead.get(`/api/employees/${PERSONA.superAdmin}`).expect(404);
    expect(out.body.code).toBe('employee.not_found');
  });

  it('the Talent Acquisition Manager sees their recruiter, not the rest of HR', async () => {
    const res = await as.taManager.get('/api/employees?pageSize=100').expect(200);
    expect(res.body.scope).toBe('TEAM');
    expect(codes(res)).toEqual(expect.arrayContaining([PERSONA.taManager, PERSONA.recruiter]));
    expect(codes(res)).not.toContain(PERSONA.hr);
  });

  it.each(['employee', 'recruiter'] as const)('%s sees only their own record', async (who) => {
    const res = await as[who].get('/api/employees').expect(200);
    expect(res.body).toMatchObject({ scope: 'SELF', total: 1 });
    expect(codes(res)).toEqual([PERSONA[who]]);

    // Their manager is shown on their own card, but cannot be opened.
    const manager = who === 'employee' ? PERSONA.teamLead : PERSONA.taManager;
    expect(res.body.items[0].reportingManager.employeeCode).toBe(manager);
    const out = await as[who].get(`/api/employees/${manager}`).expect(404);
    expect(out.body.code).toBe('employee.not_found');
  });

  it('a filter never widens the scope', async () => {
    const res = await as.employee.get(`/api/employees?q=${PERSONA.superAdmin}`).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('opens a record by employee code in any case, with the directory fields only', async () => {
    const res = await as.superAdmin.get(`/api/employees/${PERSONA.employee.toLowerCase()}`).expect(200);
    expect(res.body).toMatchObject({
      employeeCode: PERSONA.employee,
      reportingManager: { employeeCode: PERSONA.teamLead },
    });
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'company',
        'dateOfJoining',
        'department',
        'designation',
        'email',
        'employeeCode',
        'employmentType',
        'id',
        'location',
        'name',
        'reportingManager',
        'status',
      ].sort(),
    );
    await as.superAdmin.get('/api/employees/GS-999').expect(404);
  });

  it('searches by name or code, and rejects invalid filters', async () => {
    const res = await as.superAdmin.get(`/api/employees?q=${PERSONA.teamLead.toLowerCase()}`).expect(200);
    expect(codes(res)).toEqual([PERSONA.teamLead]);
    await as.superAdmin.get('/api/employees?pageSize=500').expect(400);
    await as.superAdmin.get('/api/employees?status=FIRED').expect(400);
  });

  it('needs a session', async () => {
    await request(app.getHttpServer()).get('/api/employees').expect(401);
  });
});
