import { INestApplication, RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ACCESS_KEY } from '../../src/core/iam/access.decorators.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Security baseline that every new endpoint inherits. If a test here fails, do not loosen it — fix the endpoint. */
describe('Route access rules', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('every route declares @Public, @SignedIn or @RequirePermission', () => {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const missing: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // not a route
        const rule = reflector.getAllAndOverride(ACCESS_KEY, [handler, instance.constructor]);
        if (!rule) {
          const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
          missing.push(`${method} ${wrapper.name}.${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('rejects signed-in routes without a session', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects state-changing requests from another origin (CSRF)', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    await agent.post('/api/org/companies').set('Origin', 'https://evil.example').send({}).expect(403);
  });

  it('rejects unknown fields (mass assignment)', async () => {
    const agent = await signInAs(app, PERSONA.superAdmin);
    const res = await agent
      .post('/api/org/companies')
      .set('Origin', ORIGIN)
      .send({ name: 'X Co', shortCode: 'XCO', location: 'Dubai', isAdmin: true })
      .expect(400);
    expect(res.body.code).toBe('request.invalid');
  });

  it('ends the session on logout', async () => {
    const agent = await signInAs(app, PERSONA.employee);
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').set('Origin', ORIGIN).expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('does not reveal whether an account exists', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/dev/login')
      .set('Origin', ORIGIN)
      .send({ employeeCode: 'GS-999' })
      .expect(403);
    expect(res.body.code).toBe('auth.no_access');
  });
});
