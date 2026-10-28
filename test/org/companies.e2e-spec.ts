import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Who = keyof typeof PERSONA;

/* Reference e2e test — copy this shape for each module: sign every persona in once, happy path, then a 403 per role
   that must not have access. */
describe('Companies API', () => {
  let app: INestApplication<App>;
  // One sign-in per persona for the whole file: dev login is rate-limited to 10 a minute.
  const as = {} as Record<Who, Awaited<ReturnType<typeof signInAs>>>;
  const code = () => `T${randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 8);
  const addCompany = (body: object) => as.superAdmin.post('/api/org/companies').set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    for (const who of Object.keys(PERSONA) as Who[]) as[who] = await signInAs(app, PERSONA[who]);
  });
  afterAll(() => app.close());

  it('lets any signed-in person list companies', async () => {
    const res = await as.employee.get('/api/org/companies').expect(200);
    expect(res.body.map((c: { shortCode: string }) => c.shortCode)).toContain('GSIT');
  });

  it('lets Super Admin create and edit a company, and audits it', async () => {
    const shortCode = code();
    const created = await addCompany({
      name: `Test ${shortCode}`,
      shortCode: shortCode.toLowerCase(),
      location: 'Both',
    }).expect(201);
    expect(created.body).toMatchObject({ shortCode, location: 'Both', status: 'ACTIVE' });

    const updated = await as.superAdmin
      .patch(`/api/org/companies/${created.body.id}`)
      .set('Origin', ORIGIN)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(updated.body.status).toBe('INACTIVE');
  });

  it('rejects a duplicate short code with 409', async () => {
    await addCompany({ name: 'Dup', shortCode: 'GSIT', location: 'Dubai' }).expect(409);
  });

  it('rejects an unknown location', async () => {
    const res = await addCompany({ name: 'Nowhere', shortCode: code(), location: 'Mars' }).expect(400);
    expect(res.body.code).toBe('company.unknown_location');
  });

  it('deletes an unused company with its departments and designations, and audits it (BR-ORG-005)', async () => {
    const shortCode = code();
    const company = await addCompany({ name: `Gone ${shortCode}`, shortCode, location: 'Both' }).expect(201);
    const dept = await as.superAdmin
      .post('/api/org/departments')
      .set('Origin', ORIGIN)
      .send({ companyId: company.body.id, name: 'Temporary', locationIds: ['Dubai'] })
      .expect(201);
    const des = await as.superAdmin
      .post('/api/org/designations')
      .set('Origin', ORIGIN)
      .send({ departmentId: dept.body.id, title: 'Temporary Role' })
      .expect(201);

    await as.superAdmin.delete(`/api/org/companies/${company.body.id}`).set('Origin', ORIGIN).expect(204);
    await as.employee.get(`/api/org/companies/${company.body.id}`).expect(404);
    await as.employee.get(`/api/org/departments/${dept.body.id}`).expect(404);
    await as.employee.get(`/api/org/designations/${des.body.id}`).expect(404);

    const audit = await app
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'company.deleted', entityId: company.body.id } });
    expect(audit?.before).toMatchObject({ shortCode, departments: ['Temporary'] });
  });

  it('refuses to delete a company in use and reports the usage (BR-ORG-005)', async () => {
    const companies = await as.employee.get('/api/org/companies').expect(200);
    const gsit = companies.body.find((c: { shortCode: string }) => c.shortCode === 'GSIT');
    const res = await as.superAdmin.delete(`/api/org/companies/${gsit.id}`).set('Origin', ORIGIN).expect(409);
    expect(res.body.code).toBe('company.in_use');
    expect(res.body.details.usage.employees).toBeGreaterThan(0);
  });

  it('returns 404 when deleting an unknown company', async () => {
    await as.superAdmin.delete(`/api/org/companies/${randomUUID()}`).set('Origin', ORIGIN).expect(404);
  });

  it.each(['employee', 'teamLead'] as const)('forbids %s from creating companies', async (who) => {
    await as[who]
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: 'Nope', shortCode: code(), location: 'Dubai' })
      .expect(403);
  });

  it.each(['employee', 'hr', 'officeAdmin'] as const)('forbids %s from deleting companies', async (who) => {
    await as[who].delete(`/api/org/companies/${randomUUID()}`).set('Origin', ORIGIN).expect(403);
  });

  it('lets HR edit but the frontend default gives HR no delete', async () => {
    const me = await as.hr.get('/api/auth/me').expect(200);
    expect(me.body.permissions).toContain('administration:admin-companies#edit');
    expect(me.body.permissions).not.toContain('administration:admin-companies#delete');
  });
});
