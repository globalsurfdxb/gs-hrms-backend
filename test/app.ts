import { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/core/http/configure-app.js';

export const ORIGIN = 'http://localhost:3000';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

/** Signs in as a seeded persona and returns an agent that keeps the session cookie and sends the frontend Origin. */
export async function signInAs(app: INestApplication<App>, employeeCode: string) {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/dev/login').set('Origin', ORIGIN).send({ employeeCode }).expect(204);
  return agent;
}

export const PERSONA = {
  superAdmin: 'GS-120',
  hr: 'GS-119',
  officeAdmin: 'GS-101',
  teamLead: 'GS-058',
  employee: 'GS-087',
} as const;
