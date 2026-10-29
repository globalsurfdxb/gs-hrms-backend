import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN } from '../app.js';

/* The development email + password form: only the seeded demo accounts, with the shared DEV_LOGIN_PASSWORD. */
describe('Dev email + password sign-in', () => {
  let app: INestApplication<App>;
  const password = process.env['DEV_LOGIN_PASSWORD'] || 'demo1234';
  const login = (agent: ReturnType<typeof request.agent>, email: string, pw: string) =>
    agent.post('/api/auth/dev/password-login').set('Origin', ORIGIN).send({ email, password: pw });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('signs a demo account in, whatever the email case', async () => {
    const agent = request.agent(app.getHttpServer());
    await login(agent, 'GS-119@HRMS.local', password).expect(204);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ employeeCode: 'GS-119', role: 'HR' });
  });

  it('gives the same answer for a wrong password and an unknown email, and audits both', async () => {
    const agent = request.agent(app.getHttpServer());
    const wrong = await login(agent, 'gs-120@hrms.local', `${password}x`).expect(401);
    const unknown = await login(agent, 'nobody@hrms.local', password).expect(401);
    expect(wrong.body).toMatchObject({ code: 'auth.invalid_credentials', message: 'Email or password is incorrect' });
    expect(unknown.body).toMatchObject({ code: wrong.body.code, message: wrong.body.message });

    const audit = await app.get(PrismaService).auditLog.findFirst({
      where: { action: 'auth.sign_in_failed', actorLabel: 'gs-120@hrms.local' },
      orderBy: { id: 'desc' },
    });
    expect(audit?.after).toMatchObject({ reason: 'bad_credentials', method: 'DEV' });
    await agent.get('/api/auth/me').expect(401);
  });

  it('refuses accounts outside the demo domain even with the demo password', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await login(agent, 'someone@gs-it.ae', password).expect(401);
    expect(res.body.code).toBe('auth.invalid_credentials');
  });

  it('rejects a malformed email', async () => {
    await login(request.agent(app.getHttpServer()), 'not-an-email', password).expect(400);
  });

  it('lists the demo accounts with their emails', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/dev/personas').expect(200);
    expect(res.body).toContainEqual(
      expect.objectContaining({ employeeCode: 'GS-120', email: 'gs-120@hrms.local', role: 'Super Admin' }),
    );
    expect(res.body.every((p: { email: string }) => p.email.endsWith('@hrms.local'))).toBe(true);
  });
});
