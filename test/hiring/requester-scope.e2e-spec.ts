import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Agent = Awaited<ReturnType<typeof signInAs>>;

/* BR-HIR-019 (step 3.1e): without full hiring access (Team Lead GS-058, in GSIT · Cloud & Infra, Dubai) a requisition
   is only for their own department or one they head, in a location it works in, with them as hiring manager. The
   test adds a department in another company, working in Dubai and Kochi, that the Team Lead heads. */
describe('Requisitions — Team Lead scope (BR-HIR-019)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as: Record<keyof typeof PERSONA, Agent> = {} as never;
  const id: Record<keyof typeof PERSONA, string> = {} as never;
  let ref: { gsit: string; gss: string; gsd: string; own: string; headed: string; sales: string; network: string };

  const future = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const body = (patch: Record<string, unknown> = {}) => ({
    title: 'Cloud Engineer',
    companyId: ref.gsit,
    departmentId: ref.own,
    locationId: 'Dubai',
    positions: 1,
    employmentType: 'FULL_TIME',
    reason: 'NEW_ROLE',
    budgetMin: '9000',
    budgetMax: '12000',
    targetStart: future,
    justification: 'New cloud migration project.',
    ...patch,
  });
  const post = (who: keyof typeof PERSONA, path: string, send?: object) =>
    as[who].post(`/api/hiring/requisitions${path}`).set('Origin', ORIGIN).send(send);
  const patch = (who: keyof typeof PERSONA, rid: string, send: object) =>
    as[who].patch(`/api/hiring/requisitions/${rid}`).set('Origin', ORIGIN).send(send);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const key of Object.keys(PERSONA) as (keyof typeof PERSONA)[]) {
      as[key] = await signInAs(app, PERSONA[key]);
      id[key] = (await as[key].get('/api/auth/me').expect(200)).body.employeeId;
    }
    const co = async (shortCode: string) => (await prisma.company.findUniqueOrThrow({ where: { shortCode } })).id;
    const dept = async (companyId: string, name: string) =>
      (await prisma.department.findUniqueOrThrow({ where: { companyId_name: { companyId, name } } })).id;
    const [gsit, gss, gsd] = [await co('GSIT'), await co('GSS'), await co('GSD')];
    const headed = await prisma.department.create({
      data: {
        companyId: gss,
        name: `TL scope ${Date.now()}`,
        headEmployeeId: id.teamLead,
        locations: { create: [{ locationId: 'Dubai' }, { locationId: 'Kochi' }] },
      },
    });
    ref = {
      gsit,
      gss,
      gsd,
      own: await dept(gsit, 'Cloud & Infra'),
      headed: headed.id,
      sales: await dept(gsd, 'Sales'),
      network: await dept(gsit, 'Network Engineering'),
    };
  });
  afterAll(() => app.close());

  it('tells the form what a Team Lead may choose, and that full access is not restricted', async () => {
    const tl = (await as.teamLead.get('/api/hiring/requisitions/scope').expect(200)).body;
    expect(tl).toMatchObject({
      restricted: true,
      hiringManager: { id: id.teamLead, employeeCode: PERSONA.teamLead },
      defaultLocationId: 'Dubai',
    });
    expect(tl.departments[0]).toMatchObject({
      id: ref.own,
      name: 'Cloud & Infra',
      company: { id: ref.gsit },
      locations: [{ id: 'Dubai' }],
    });
    const headed = tl.departments.find((d: { id: string }) => d.id === ref.headed);
    expect(headed.locations.map((l: { id: string }) => l.id)).toEqual(['Dubai', 'Kochi']);
    expect(tl.departments.some((d: { id: string }) => d.id === ref.sales)).toBe(false);

    const hr = (await as.hr.get('/api/hiring/requisitions/scope').expect(200)).body;
    expect(hr).toEqual({ restricted: false, hiringManager: null, departments: [], defaultLocationId: null });

    await as.employee.get('/api/hiring/requisitions/scope').expect(403);
    await as.recruiter.get('/api/hiring/requisitions/scope').expect(403);
  });

  it('lets a Team Lead raise for their own department and one they head, as hiring manager', async () => {
    const own = (await post('teamLead', '', body()).expect(201)).body;
    expect(own).toMatchObject({ department: { id: ref.own }, hiringManager: { id: id.teamLead } });

    const kochi = (
      await post('teamLead', '', body({ companyId: ref.gss, departmentId: ref.headed, locationId: 'Kochi' })).expect(
        201,
      )
    ).body;
    expect(kochi).toMatchObject({
      company: { id: ref.gss },
      location: { id: 'Kochi' },
      budgetMin: { currency: 'INR' },
    });
  });

  it('refuses another department, a location the department does not work in, and another hiring manager', async () => {
    const code = async (send: object, status: number) => (await post('teamLead', '', send).expect(status)).body.code;
    expect(await code(body({ companyId: ref.gsd, departmentId: ref.sales }), 403)).toBe(
      'requisition.department_not_allowed',
    );
    expect(await code(body({ locationId: 'Kochi' }), 400)).toBe('requisition.location_not_allowed');
    expect(await code(body({ hiringManagerId: id.superAdmin }), 403)).toBe('requisition.hiring_manager_fixed');
    // Decided by permission: Office Admin (Requisitions only) is limited to Procurement the same way.
    expect((await post('officeAdmin', '', body({ hiringManagerId: id.officeAdmin })).expect(403)).body.code).toBe(
      'requisition.department_not_allowed',
    );
  });

  it('still needs a hiring manager from full-access users', async () => {
    expect((await post('hr', '', body()).expect(400)).body.code).toBe('requisition.hiring_manager_required');
    await post('hr', '', body({ companyId: ref.gsd, departmentId: ref.sales, hiringManagerId: id.teamLead })).expect(
      201,
    );
  });

  it('keeps a requisition HR raised for them elsewhere editable, but not movable', async () => {
    const r = (
      await post('hr', '', body({ companyId: ref.gsd, departmentId: ref.sales, hiringManagerId: id.teamLead })).expect(
        201,
      )
    ).body;
    await patch('teamLead', r.id, { title: 'Senior Cloud Engineer', positions: 2 }).expect(200);
    expect(
      (await patch('teamLead', r.id, { companyId: ref.gsit, departmentId: ref.network }).expect(403)).body.code,
    ).toBe('requisition.department_not_allowed');
    expect((await patch('teamLead', r.id, { hiringManagerId: id.superAdmin }).expect(403)).body.code).toBe(
      'requisition.hiring_manager_fixed',
    );
    // Moving it into their own department is allowed.
    await patch('teamLead', r.id, { companyId: ref.gsit, departmentId: ref.own }).expect(200);
    const submitted = (await post('teamLead', `/${r.id}/submit`).expect(200)).body;
    expect(submitted.status).toBe('PENDING_APPROVAL');
  });
});
