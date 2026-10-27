import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

describe('Locations API', () => {
  let app: INestApplication<App>;
  const tag = () => randomBytes(3).toString('hex');
  const body = (city: string) => ({
    name: `Test Country ${city}`,
    city,
    currency: 'sar',
    timezone: 'Asia/Riyadh',
    phoneCode: '+ 966',
    phoneDigits: 9,
    workingHours: '09:00 – 18:00, Sun–Thu',
    seating: [' Olaya Tower ', ''],
    template: 'UAE',
  });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('lets any signed-in person list locations, built-in first', async () => {
    const agent = await signInAs(app, PERSONA.employee);
    const res = await agent.get('/api/org/locations').expect(200);
    expect(
      res.body
        .slice(0, 2)
        .map((l: { id: string }) => l.id)
        .sort(),
    ).toEqual(['Dubai', 'Kochi']);
    expect(res.body[0]).toMatchObject({ system: true });
  });

  it('returns 404 for an unknown location', async () => {
    const agent = await signInAs(app, PERSONA.employee);
    await agent.get('/api/org/locations/Atlantis').expect(404);
  });

  it('lets Super Admin add, edit and delete a location, and audits each change', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const city = `Riyadh ${tag()}`;
    const created = await agent.post('/api/org/locations').set('Origin', ORIGIN).send(body(city)).expect(201);
    expect(created.body).toMatchObject({
      id: city.replace(' ', '-'),
      currency: 'SAR',
      phoneCode: '+966',
      seating: ['Olaya Tower'],
      system: false,
    });
    const id = created.body.id as string;

    const updated = await agent
      .patch(`/api/org/locations/${id}`)
      .set('Origin', ORIGIN)
      .send({ template: 'INDIA', seating: ['Olaya Tower', 'King Fahd Road'] })
      .expect(200);
    expect(updated.body).toMatchObject({ template: 'INDIA', seating: ['Olaya Tower', 'King Fahd Road'] });

    await agent.delete(`/api/org/locations/${id}`).set('Origin', ORIGIN).expect(204);
    await agent.get(`/api/org/locations/${id}`).expect(404);

    const actions = await app
      .get(PrismaService)
      .auditLog.findMany({ where: { entityType: 'location', entityId: id }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual(['location.created', 'location.deleted', 'location.updated']);
  });

  it('rejects a duplicate name ignoring case (BR-ORG-007)', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const res = await agent
      .post('/api/org/locations')
      .set('Origin', ORIGIN)
      .send({ ...body(`X ${tag()}`), name: 'united arab emirates' })
      .expect(409);
    expect(res.body.code).toBe('location.name_taken');
  });

  it('rejects an invalid phone code, timezone and unknown fields', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const post = (extra: object) =>
      agent
        .post('/api/org/locations')
        .set('Origin', ORIGIN)
        .send({ ...body(`X ${tag()}`), ...extra });
    expect((await post({ phoneCode: '966' }).expect(400)).body.code).toBe('location.invalid_phone_code');
    expect((await post({ timezone: 'Mars/Olympus' }).expect(400)).body.code).toBe('location.invalid_timezone');
    expect((await post({ system: true }).expect(400)).body.code).toBe('request.invalid');
  });

  it('refuses to delete a built-in location or change its template (BR-ORG-004, BR-ORG-010)', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const del = await agent.delete('/api/org/locations/Dubai').set('Origin', ORIGIN).expect(409);
    expect(del.body.code).toBe('location.system');
    const patch = await agent
      .patch('/api/org/locations/Dubai')
      .set('Origin', ORIGIN)
      .send({ template: 'INDIA' })
      .expect(409);
    expect(patch.body.code).toBe('location.system_template');
  });

  it('refuses to delete a location in use and reports the usage (BR-ORG-004)', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const city = `Jeddah ${tag()}`;
    const { body: location } = await agent
      .post('/api/org/locations')
      .set('Origin', ORIGIN)
      .send(body(city))
      .expect(201);
    await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: `Uses ${city}`, shortCode: `J${tag()}`.toUpperCase().slice(0, 8), location: location.id })
      .expect(201);

    const res = await agent.delete(`/api/org/locations/${location.id}`).set('Origin', ORIGIN).expect(409);
    expect(res.body).toMatchObject({ code: 'location.in_use', details: { usage: { companies: 1 } } });
  });

  it.each([PERSONA.employee, PERSONA.teamLead])('forbids %s from adding locations', async (persona) => {
    const agent = await signInAs(app, persona);
    await agent
      .post('/api/org/locations')
      .set('Origin', ORIGIN)
      .send(body(`X ${tag()}`))
      .expect(403);
  });

  it.each([PERSONA.hr, PERSONA.officeAdmin])('forbids %s from deleting (no Delete by default)', async (persona) => {
    const agent = await signInAs(app, persona);
    await agent.delete('/api/org/locations/Kochi').set('Origin', ORIGIN).expect(403);
  });
});
