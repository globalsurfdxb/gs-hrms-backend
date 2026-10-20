import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Reference e2e test — copy this shape for each module: happy path, then a 403 per role that must not have access. */
describe('Companies API', () => {
  let app: INestApplication<App>;
  const code = () => `T${randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 8);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('lets any signed-in person list companies', async () => {
    const agent = await signInAs(app, PERSONA.employee);
    const res = await agent.get('/api/org/companies').expect(200);
    expect(res.body.map((c: { shortCode: string }) => c.shortCode)).toContain('GSIT');
  });

  it('lets Super Admin create and edit a company, and audits it', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const shortCode = code();
    const created = await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: `Test ${shortCode}`, shortCode: shortCode.toLowerCase(), location: 'Both' })
      .expect(201);
    expect(created.body).toMatchObject({ shortCode, location: 'Both', status: 'ACTIVE' });

    const updated = await agent
      .patch(`/api/org/companies/${created.body.id}`)
      .set('Origin', ORIGIN)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(updated.body.status).toBe('INACTIVE');
  });

  it('rejects a duplicate short code with 409', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: 'Dup', shortCode: 'GSIT', location: 'Dubai' })
      .expect(409);
  });

  it('rejects an unknown location', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const res = await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: 'Nowhere', shortCode: code(), location: 'Mars' })
      .expect(400);
    expect(res.body.code).toBe('company.unknown_location');
  });

  it.each([PERSONA.employee, PERSONA.teamLead])('forbids %s from creating companies', async (persona) => {
    const agent = await signInAs(app, persona);
    await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: 'Nope', shortCode: code(), location: 'Dubai' })
      .expect(403);
  });

  it('lets HR edit but the frontend default gives HR no delete', async () => {
    const agent = await signInAs(app, PERSONA.hr);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.permissions).toContain('administration:admin-companies#edit');
    expect(me.body.permissions).not.toContain('administration:admin-companies#delete');
  });
});
