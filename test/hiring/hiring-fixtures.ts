import { randomInt, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { ORIGIN, PERSONA, signInAs } from '../app.js';

export type Agent = Awaited<ReturnType<typeof signInAs>>;
export type Who = keyof typeof PERSONA;

/* Shared setup for the hiring e2e specs that need a job: sign every persona in, and walk a requisition through
   approval to an OPEN job (Team Lead raises, HR and Super Admin approve, HR creates the job). */
export async function hiringWorld(app: INestApplication<App>) {
  const prisma = app.get(PrismaService);
  const as: Record<Who, Agent> = {} as never;
  const id: Record<Who, string> = {} as never;
  for (const key of Object.keys(PERSONA) as Who[]) {
    as[key] = await signInAs(app, PERSONA[key]);
    id[key] = (await as[key].get('/api/auth/me').expect(200)).body.employeeId;
  }
  const gsit = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
  const dept = await prisma.department.findUniqueOrThrow({
    where: { companyId_name: { companyId: gsit.id, name: 'Cloud & Infra' } },
  });

  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const send = (who: Who, method: 'post' | 'put', path: string, body?: object) =>
    as[who][method](`/api/hiring${path}`).set('Origin', ORIGIN).send(body);

  /** A job from a fully approved requisition; OPEN unless publish is false. */
  async function job(publish = true): Promise<{ id: string; code: string }> {
    const r = await send('teamLead', 'post', '/requisitions', {
      title: 'Network Engineer',
      companyId: gsit.id,
      departmentId: dept.id,
      locationId: 'Dubai',
      positions: 2,
      employmentType: 'FULL_TIME',
      reason: 'NEW_ROLE',
      budgetMin: '9000',
      budgetMax: '12000',
      targetStart: future(60),
      hiringManagerId: id.teamLead,
      justification: 'New managed-network clients.',
      submit: true,
    }).expect(201);
    await send('hr', 'post', `/requisitions/${r.body.id}/decision`, { decision: 'APPROVED' }).expect(200);
    await send('superAdmin', 'post', `/requisitions/${r.body.id}/decision`, { decision: 'APPROVED' }).expect(200);
    const j = await send('hr', 'post', `/requisitions/${r.body.id}/job`, {
      description: 'Design, deploy and support client networks.',
      skills: ['Cisco'],
      expMin: 2,
      expMax: 6,
      panelIds: [id.teamLead],
      recruiterId: id.hr,
      closingDate: future(30),
      publish,
    }).expect(201);
    return { id: j.body.id, code: j.body.code };
  }

  /** A candidate body with a unique email and phone (e2e runs share one database). */
  const candidate = (patch: Record<string, unknown> = {}) => ({
    name: 'Priya Nair',
    email: `priya.${randomUUID()}@example.com`,
    phone: `+971 5${randomInt(10_000_000, 99_999_999)}`,
    currentCompany: 'Emirates Networks LLC',
    currentTitle: 'Network Engineer',
    experienceYears: 4.5,
    noticeDays: 30,
    source: 'LINKEDIN',
    consent: true,
    ...patch,
  });

  return { prisma, as, id, send, job, candidate };
}
