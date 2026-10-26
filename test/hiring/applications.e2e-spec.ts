import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../app.js';
import { hiringWorld, type Who } from './hiring-fixtures.js';

/* Pipeline (hiring step 3): moves, exits, reopen, closed jobs, the job's pipeline list, append-only stage history,
   and access for HR / Super Admin only. */
describe('Pipeline API', () => {
  let app: INestApplication<App>;
  let w: Awaited<ReturnType<typeof hiringWorld>>;

  /** A fresh job with one candidate on it; returns the application id. */
  async function onNewJob(patch: Record<string, unknown> = {}) {
    const job = await w.job();
    const c = (await w.send('hr', 'post', '/candidates', w.candidate({ jobId: job.id, ...patch })).expect(201)).body;
    return { job, candidate: c, appId: c.applications[0].id as string };
  }
  const act = (who: Who, appId: string, action: string, body?: object) =>
    w.send(who, 'post', `/applications/${appId}/${action}`, body);

  beforeAll(async () => {
    app = await createTestApp();
    w = await hiringWorld(app);
  });
  afterAll(() => app.close());

  it('moves forward and back with a history line each, never to Hired (BR-HIR-009)', async () => {
    const { appId } = await onNewJob();
    await act('hr', appId, 'move', { stage: 'TECHNICAL_INTERVIEW', note: 'Strong call' }).expect(200);
    const back = await act('superAdmin', appId, 'move', { stage: 'SCREENING' }).expect(200);
    expect(back.body.stage).toBe('SCREENING');
    expect(back.body.history.map((h: { from: string | null; to: string }) => `${h.from}>${h.to}`)).toEqual([
      'null>APPLIED',
      'APPLIED>TECHNICAL_INTERVIEW',
      'TECHNICAL_INTERVIEW>SCREENING',
    ]);
    expect(back.body.history[1].note).toBe('Strong call');
    expect((await act('hr', appId, 'move', { stage: 'HIRED' }).expect(400)).body.code).toBe('request.invalid');
    // Same stage: nothing changes, no new line.
    const same = await act('hr', appId, 'move', { stage: 'SCREENING' }).expect(200);
    expect(same.body.history).toHaveLength(3);
  });

  it('rejects with a reason, reopens to the stage it left, and keeps the history append-only', async () => {
    const { appId } = await onNewJob();
    await act('hr', appId, 'move', { stage: 'HR_INTERVIEW' }).expect(200);
    expect((await act('hr', appId, 'exit', { exit: 'REJECTED' }).expect(400)).body.code).toBe(
      'application.reason_required',
    );
    expect((await act('hr', appId, 'exit', { exit: 'REJECTED', reason: 'Too tall' }).expect(400)).body.code).toBe(
      'application.invalid_reason',
    );
    const rejected = await act('hr', appId, 'exit', { exit: 'REJECTED', reason: 'Skills mismatch', note: 'No SD-WAN' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ exit: 'REJECTED', exitFrom: 'HR_INTERVIEW', exitReason: 'Skills mismatch' });

    const reopened = await act('hr', appId, 'reopen').expect(200);
    expect(reopened.body).toMatchObject({ stage: 'HR_INTERVIEW', exit: null, exitFrom: null });
    expect(reopened.body.history.at(-1)).toMatchObject({ from: 'REJECTED', to: 'HR_INTERVIEW', note: 'Reopened' });
    expect((await act('hr', appId, 'reopen').expect(409)).body.code).toBe('application.not_exited');

    const where = { applicationId: appId };
    await expect(w.prisma.stageChange.updateMany({ where, data: { note: 'x' } })).rejects.toThrow(/append-only/);
    await expect(w.prisma.stageChange.deleteMany({ where })).rejects.toThrow(/append-only/);
    const actions = (await w.prisma.auditLog.findMany({ where: { entityId: appId }, orderBy: { at: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(['application.moved', 'application.exited', 'application.reopened']);
  });

  it('freezes the pipeline while the job is closed', async () => {
    const { job, appId } = await onNewJob();
    await act('hr', appId, 'exit', { exit: 'ON_HOLD', reason: 'Paused' }).expect(200);
    await w.send('hr', 'post', `/jobs/${job.id}/close`).expect(200);
    expect((await act('hr', appId, 'move', { stage: 'SCREENING' }).expect(409)).body.code).toBe(
      'application.job_closed',
    );
    expect((await act('hr', appId, 'reopen').expect(409)).body.code).toBe('application.job_closed');
    // Exits stay possible on a closed job (e.g. rejecting the rest once it is closed).
    await act('hr', appId, 'exit', { exit: 'REJECTED', reason: 'Position closed or on hold' }).expect(200);
  });

  it('lists a job’s pipeline with filters and sorting', async () => {
    const { job, appId } = await onNewJob({ name: 'Aisha Rahman', tags: ['Shortlisted'] });
    const second = (
      await w.send('hr', 'post', '/candidates', w.candidate({ name: 'Zayd Khan', jobId: job.id })).expect(201)
    ).body.applications[0].id;
    await act('hr', second, 'move', { stage: 'SCREENING' }).expect(200);
    await act('hr', appId, 'exit', { exit: 'WITHDRAWN', reason: 'Withdrawn by candidate' }).expect(200);

    const list = (query: Record<string, string | number>) =>
      w.as.hr
        .get(`/api/hiring/jobs/${job.id}/applications`)
        .query(query)
        .expect(200)
        .then((r) => r.body);
    const all = await list({ sort: 'name', dir: 'asc' });
    expect(all.total).toBe(2);
    expect(all.items.map((a: { candidate: { name: string } }) => a.candidate.name)).toEqual([
      'Aisha Rahman',
      'Zayd Khan',
    ]);
    expect(all.items[0]).not.toHaveProperty('candidate.currentSalary');
    expect((await list({ stage: 'SCREENING' })).items.map((a: { id: string }) => a.id)).toEqual([second]);
    expect((await list({ exit: 'NONE' })).items.map((a: { id: string }) => a.id)).toEqual([second]);
    expect((await list({ exit: 'WITHDRAWN' })).items.map((a: { id: string }) => a.id)).toEqual([appId]);
    expect((await list({ q: 'aisha' })).total).toBe(1);
    expect((await list({ tag: 'Shortlisted' })).total).toBe(1);
    expect((await list({ inStageForDays: 1 })).total).toBe(0);
    await w.as.hr.get(`/api/hiring/jobs/${randomUUID()}/applications`).expect(404);
  });

  it.each(['teamLead', 'officeAdmin', 'employee'] as Who[])('gives %s no access to the pipeline', async (who) => {
    const { job, appId } = await onNewJob();
    await w.as[who].get(`/api/hiring/jobs/${job.id}/applications`).expect(403);
    await w.as[who].get(`/api/hiring/applications/${appId}`).expect(403);
    await act(who, appId, 'move', { stage: 'SCREENING' }).expect(403);
    await act(who, appId, 'exit', { exit: 'WITHDRAWN' }).expect(403);
    await act(who, appId, 'reopen').expect(403);
  });

  it('returns 404 for an unknown application', async () => {
    await w.as.hr.get(`/api/hiring/applications/${randomUUID()}`).expect(404);
    await act('hr', randomUUID(), 'move', { stage: 'SCREENING' }).expect(404);
  });
});
