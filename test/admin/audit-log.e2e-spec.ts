import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Who = keyof typeof PERSONA;

describe('Audit log API', () => {
  let app: INestApplication<App>;
  // One sign-in per persona for the whole file: dev login is rate-limited to 10 a minute.
  const as = {} as Record<Who, Awaited<ReturnType<typeof signInAs>>>;
  let companyId: string;
  let superAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    for (const who of Object.keys(PERSONA) as Who[]) as[who] = await signInAs(app, PERSONA[who]);
    superAdminId = (await as.superAdmin.get('/api/auth/me').expect(200)).body.employeeId;

    // Something to find: a company created by Super Admin.
    const shortCode = `A${randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 8);
    const created = await as.superAdmin
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: `Audit ${shortCode}`, shortCode, location: 'Both' })
      .expect(201);
    companyId = created.body.id;
  });
  afterAll(() => app.close());

  it('lists the events of one record, newest first, with who did it', async () => {
    const res = await as.superAdmin.get('/api/admin/audit').query({ entityId: companyId }).expect(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    expect(res.body.items[0]).toMatchObject({
      module: 'Organization',
      action: 'company.created',
      entityType: 'company',
      entityId: companyId,
      actor: { id: superAdminId, label: 'Dev Super Admin' },
    });
    expect(typeof res.body.items[0].id).toBe('string');
  });

  it('combines text, module, actor and date filters', async () => {
    const hit = await as.hr
      .get('/api/admin/audit')
      .query({ q: 'COMPANY.CREATED', module: 'Organization', actorId: superAdminId, from: '2020-01-01T00:00:00Z' })
      .expect(200);
    expect(hit.body.total).toBeGreaterThan(0);
    expect(hit.body.items.every((i: { action: string }) => i.action === 'company.created')).toBe(true);

    const none = await as.hr.get('/api/admin/audit').query({ to: '2000-01-01T00:00:00Z' }).expect(200);
    expect(none.body).toMatchObject({ total: 0, items: [] });
  });

  it('pages the results', async () => {
    const res = await as.superAdmin.get('/api/admin/audit').query({ page: 2, pageSize: 1 }).expect(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 1 });
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects invalid filters', async () => {
    await as.superAdmin.get('/api/admin/audit').query({ pageSize: 500 }).expect(400);
    await as.superAdmin.get('/api/admin/audit').query({ from: 'yesterday' }).expect(400);
    await as.superAdmin.get('/api/admin/audit').query({ actorId: 'GS-120' }).expect(400);
  });

  it('returns the values for the filter dropdowns', async () => {
    const res = await as.superAdmin.get('/api/admin/audit/filters').expect(200);
    expect(res.body.modules).toEqual(expect.arrayContaining(['Organization', 'Security']));
    expect(res.body.actions).toContain('company.created');
    expect(res.body.actors).toContainEqual({ id: superAdminId, label: 'Dev Super Admin' });
  });

  it('exports CSV and audits the export', async () => {
    const res = await as.superAdmin.get('/api/admin/audit/export').query({ entityId: companyId }).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('Time,Module,Action,By,By (id),Entity,Entity id,Before,After,IP');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('company.created');

    const exported = await as.superAdmin
      .get('/api/admin/audit')
      .query({ action: 'audit.exported', actorId: superAdminId })
      .expect(200);
    expect(exported.body.items[0]).toMatchObject({
      module: 'Security',
      after: { filters: { entityId: companyId }, rows: 1 },
    });
  });

  it.each(['employee', 'teamLead'] as const)('forbids %s from reading or exporting the audit log', async (who) => {
    await as[who].get('/api/admin/audit').expect(403);
    await as[who].get('/api/admin/audit/filters').expect(403);
    await as[who].get('/api/admin/audit/export').expect(403);
  });
});
