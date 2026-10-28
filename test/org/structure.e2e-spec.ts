import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Who = keyof typeof PERSONA;
interface Dept {
  id: string;
  name: string;
  locationIds: string[];
  designations: { id: string; title: string }[];
}

/* Departments and designations (Company Structure). Seed: every persona works in Dubai; GS IT operates everywhere,
   GS Digital only in Dubai. */
describe('Departments and designations API', () => {
  let app: INestApplication<App>;
  // One sign-in per persona for the whole file: dev login is rate-limited to 10 a minute.
  const as = {} as Record<Who, Awaited<ReturnType<typeof signInAs>>>;
  const employeeId = {} as Record<Who, string>;
  const companyId: Record<string, string> = {};
  const tag = () => randomBytes(3).toString('hex');

  const seeded = async (company: string, name: string): Promise<Dept> => {
    const res = await as.employee.get('/api/org/departments').query({ companyId: companyId[company] }).expect(200);
    return res.body.find((d: Dept) => d.name === name);
  };
  const addDept = (body: object) => as.superAdmin.post('/api/org/departments').set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    for (const who of Object.keys(PERSONA) as Who[]) {
      as[who] = await signInAs(app, PERSONA[who]);
      employeeId[who] = (await as[who].get('/api/auth/me').expect(200)).body.employeeId;
    }
    const companies = await as.employee.get('/api/org/companies').expect(200);
    for (const c of companies.body) companyId[c.shortCode] = c.id;
  });
  afterAll(() => app.close());

  it('lets any signed-in person list departments with their designations, filtered by company and location', async () => {
    const cloud = await seeded('GSIT', 'Cloud & Infra');
    expect(cloud).toMatchObject({ locationIds: ['Dubai'], designations: [{ title: 'Solutions Architect' }] });

    const kochi = await as.employee
      .get('/api/org/departments')
      .query({ companyId: companyId.GSIT, locationId: 'Kochi' })
      .expect(200);
    const names = kochi.body.map((d: Dept) => d.name);
    expect(names).toContain('HR');
    expect(names).not.toContain('Cloud & Infra');

    const designations = await as.employee.get('/api/org/designations').query({ departmentId: cloud.id }).expect(200);
    expect(designations.body.map((d: { title: string }) => d.title)).toEqual(['Solutions Architect']);
  });

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    await as.employee.get(`/api/org/departments/${randomUUID()}`).expect(404);
    await as.employee.get(`/api/org/designations/${randomUUID()}`).expect(404);
    await as.employee.get('/api/org/departments/not-a-uuid').expect(400);
  });

  it('lets Super Admin manage a department and its designations end to end, and audits each change', async () => {
    const created = await addDept({
      companyId: companyId.GSIT,
      name: `  Data ${tag()} `,
      locationIds: ['Kochi', 'Dubai', 'Kochi'],
      headEmployeeId: employeeId.teamLead,
    }).expect(201);
    expect(created.body).toMatchObject({
      locationIds: ['Dubai', 'Kochi'],
      head: { employeeCode: PERSONA.teamLead },
      designations: [],
    });
    const deptId = created.body.id as string;

    const des = await as.superAdmin
      .post('/api/org/designations')
      .set('Origin', ORIGIN)
      .send({ departmentId: deptId, title: 'Data Engineer' })
      .expect(201);
    await as.superAdmin
      .patch(`/api/org/designations/${des.body.id}`)
      .set('Origin', ORIGIN)
      .send({ title: 'Senior Data Engineer' })
      .expect(200);
    const updated = await as.superAdmin
      .patch(`/api/org/departments/${deptId}`)
      .set('Origin', ORIGIN)
      .send({ locationIds: ['Dubai'], headEmployeeId: null })
      .expect(200);
    expect(updated.body).toMatchObject({
      locationIds: ['Dubai'],
      head: null,
      designations: [{ title: 'Senior Data Engineer' }],
    });

    // An unused department is deleted with its designations.
    await as.superAdmin.delete(`/api/org/departments/${deptId}`).set('Origin', ORIGIN).expect(204);
    await as.employee.get(`/api/org/designations/${des.body.id}`).expect(404);

    const audit = await app.get(PrismaService).auditLog.findMany({
      where: { entityId: { in: [deptId, des.body.id] } },
      select: { action: true },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'department.created',
      'department.deleted',
      'department.updated',
      'designation.created',
      'designation.updated',
    ]);
  });

  it('rejects a duplicate department name or designation title, ignoring case (BR-ORG-012, BR-ORG-015)', async () => {
    const dup = await addDept({ companyId: companyId.GSIT, name: 'cloud & INFRA', locationIds: ['Dubai'] }).expect(409);
    expect(dup.body.code).toBe('department.name_taken');

    const cloud = await seeded('GSIT', 'Cloud & Infra');
    const des = await as.superAdmin
      .post('/api/org/designations')
      .set('Origin', ORIGIN)
      .send({ departmentId: cloud.id, title: 'solutions architect' })
      .expect(409);
    expect(des.body.code).toBe('designation.title_taken');
  });

  it('checks locations and the head (BR-ORG-013, BR-ORG-014)', async () => {
    const name = `Dept ${tag()}`;
    const codeOf = async (body: object) => (await addDept({ name, ...body }).expect(400)).body.code;

    expect(await codeOf({ companyId: companyId.GSIT, locationIds: [] })).toBe('department.location_required');
    expect(await codeOf({ companyId: companyId.GSIT, locationIds: ['Mars'] })).toBe('department.unknown_location');
    expect(await codeOf({ companyId: companyId.GSD, locationIds: ['Dubai', 'Kochi'] })).toBe(
      'department.location_outside_company',
    );
    // GS-087 works for GS Digital, not GS IT.
    expect(
      await codeOf({ companyId: companyId.GSIT, locationIds: ['Dubai'], headEmployeeId: employeeId.employee }),
    ).toBe('department.invalid_head');
    expect(await codeOf({ companyId: randomUUID(), locationIds: ['Dubai'] })).toBe('department.unknown_company');
  });

  it('refuses to delete a department or designation in use (BR-ORG-016)', async () => {
    const cloud = await seeded('GSIT', 'Cloud & Infra');
    const dept = await as.superAdmin.delete(`/api/org/departments/${cloud.id}`).set('Origin', ORIGIN).expect(409);
    expect(dept.body).toMatchObject({ code: 'department.in_use', details: { usage: { employees: 1 } } });

    const des = await as.superAdmin
      .delete(`/api/org/designations/${cloud.designations[0].id}`)
      .set('Origin', ORIGIN)
      .expect(409);
    expect(des.body).toMatchObject({ code: 'designation.in_use', details: { usage: { employees: 1 } } });
  });

  it('refuses to remove a location where employees of the department work (BR-ORG-017)', async () => {
    const hr = await seeded('GSIT', 'HR');
    const res = await as.superAdmin
      .patch(`/api/org/departments/${hr.id}`)
      .set('Origin', ORIGIN)
      .send({ locationIds: ['Kochi'] })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'department.location_in_use', details: { staffByLocation: { Dubai: 1 } } });
  });

  it.each(['employee', 'teamLead'] as const)('forbids %s from adding departments or designations', async (who) => {
    const cloud = await seeded('GSIT', 'Cloud & Infra');
    await as[who]
      .post('/api/org/departments')
      .set('Origin', ORIGIN)
      .send({ companyId: companyId.GSIT, name: `No ${tag()}`, locationIds: ['Dubai'] })
      .expect(403);
    await as[who]
      .post('/api/org/designations')
      .set('Origin', ORIGIN)
      .send({ departmentId: cloud.id, title: `No ${tag()}` })
      .expect(403);
  });

  it.each(['hr', 'officeAdmin'] as const)('forbids %s from deleting (no Delete by default)', async (who) => {
    const cloud = await seeded('GSIT', 'Cloud & Infra');
    await as[who].delete(`/api/org/departments/${cloud.id}`).set('Origin', ORIGIN).expect(403);
    await as[who].delete(`/api/org/designations/${cloud.designations[0].id}`).set('Origin', ORIGIN).expect(403);
  });
});
