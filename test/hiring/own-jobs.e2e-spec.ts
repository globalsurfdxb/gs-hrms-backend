import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../app.js';
import { hiringWorld } from './hiring-fixtures.js';

/* BR-HIR-022 (step 3.1c): without full hiring access (Jobs + Requisitions → View) a person sees and acts on their own
   jobs only — those they recruit for or manage — and on the candidates and applications on them. Everything else is
   404, and nothing reveals who else is on file. The Talent Acquisition Manager has full access. */
describe('Own jobs (BR-HIR-022)', () => {
  let app: INestApplication<App>;
  let w: Awaited<ReturnType<typeof hiringWorld>>;
  let mine: { id: string };
  let other: { id: string };
  let mineApp: string;
  let otherApp: string;
  let otherCandidate: { id: string; email: string; phone: string };
  let bothCandidate: string;

  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);

  beforeAll(async () => {
    app = await createTestApp();
    w = await hiringWorld(app);
    mine = await w.job();
    other = await w.job();
    // HR hands one job to the Recruiter; the other stays with HR.
    await w.send('hr', 'put', `/jobs/${mine.id}/recruiter`, { recruiterId: w.id.recruiter }).expect(200);

    const a = await w.send('hr', 'post', '/candidates', { ...w.candidate(), jobId: mine.id }).expect(201);
    mineApp = a.body.applications[0].id;
    const body = w.candidate({ currentSalary: '9000' });
    const b = await w.send('hr', 'post', '/candidates', { ...body, jobId: other.id }).expect(201);
    otherApp = b.body.applications[0].id;
    otherCandidate = { id: b.body.id, email: body.email as string, phone: body.phone as string };

    const c = await w.send('hr', 'post', '/candidates', { ...w.candidate(), jobId: other.id }).expect(201);
    bothCandidate = c.body.id;
    await w.send('hr', 'post', `/candidates/${bothCandidate}/applications`, { jobId: mine.id }).expect(201);
  });
  afterAll(() => app.close());

  it('lists and opens only the Recruiter’s own jobs; another job is 404', async () => {
    const list = await w.as.recruiter.get('/api/hiring/jobs?pageSize=100').expect(200);
    expect(ids(list)).toContain(mine.id);
    expect(ids(list)).not.toContain(other.id);
    expect(list.body.items.every((j: { recruiter: { id: string } }) => j.recruiter.id === w.id.recruiter)).toBe(true);

    const job = await w.as.recruiter.get(`/api/hiring/jobs/${mine.id}`).expect(200);
    expect(job.body.viewer).toMatchObject({ actions: [], canChangeRecruiter: false });
    const res = await w.as.recruiter.get(`/api/hiring/jobs/${other.id}`).expect(404);
    expect(res.body.code).toBe('job.not_found');
  });

  it('leaves job status, recruiter and job creation to full hiring access', async () => {
    const own = await w.send('recruiter', 'post', `/jobs/${mine.id}/hold`).expect(403);
    expect(own.body.code).toBe('hiring.full_access_required');
    await w.send('recruiter', 'put', `/jobs/${mine.id}/recruiter`, { recruiterId: w.id.recruiter }).expect(403);
    await w.send('recruiter', 'post', `/jobs/${other.id}/hold`).expect(404);
  });

  it('shows the pipeline and applications of own jobs only, and moves only those', async () => {
    const board = await w.as.recruiter.get(`/api/hiring/jobs/${mine.id}/applications`).expect(200);
    expect(ids(board)).toContain(mineApp);
    await w.as.recruiter.get(`/api/hiring/jobs/${other.id}/applications`).expect(404);

    await w.as.recruiter.get(`/api/hiring/applications/${otherApp}`).expect(404);
    await w.send('recruiter', 'post', `/applications/${otherApp}/move`, { stage: 'SCREENING' }).expect(404);
    await w.send('recruiter', 'post', `/applications/${otherApp}/exit`, { exit: 'ON_HOLD' }).expect(404);

    const moved = await w.send('recruiter', 'post', `/applications/${mineApp}/move`, { stage: 'SCREENING' });
    expect(moved.status).toBe(200);
    expect(moved.body.stage).toBe('SCREENING');
  });

  it('lists and opens only candidates on own jobs, with only those applications', async () => {
    const list = await w.as.recruiter.get('/api/hiring/candidates?pageSize=100').expect(200);
    expect(ids(list)).toContain(bothCandidate);
    expect(ids(list)).not.toContain(otherCandidate.id);

    // Filtering by someone else's job finds nothing, not even a candidate who is also on an own job.
    const byOther = await w.as.recruiter.get(`/api/hiring/candidates?jobId=${other.id}`).expect(200);
    expect(byOther.body.items).toEqual([]);

    await w.as.recruiter.get(`/api/hiring/candidates/${otherCandidate.id}`).expect(404);
    await w.send('recruiter', 'post', `/candidates/${otherCandidate.id}/notes`, { text: 'Hi' }).expect(404);
    await w.send('recruiter', 'put', `/candidates/${otherCandidate.id}/tags`, { tags: ['x'] }).expect(404);
    await w.send('recruiter', 'post', `/candidates/${otherCandidate.id}/applications`, { jobId: mine.id }).expect(404);

    const both = await w.as.recruiter.get(`/api/hiring/candidates/${bothCandidate}`).expect(200);
    expect(both.body.applications.map((a: { job: { id: string } }) => a.job.id)).toEqual([mine.id]);
    const hr = await w.as.hr.get(`/api/hiring/candidates/${bothCandidate}`).expect(200);
    expect(hr.body.applications).toHaveLength(2);
  });

  it('adds candidates only onto own open jobs, and sees salary there', async () => {
    const none = await w.send('recruiter', 'post', '/candidates', w.candidate({ locationId: 'Dubai' })).expect(400);
    expect(none.body.code).toBe('candidate.job_required');
    await w.send('recruiter', 'post', '/candidates', { ...w.candidate(), jobId: other.id }).expect(404);

    const res = await w
      .send('recruiter', 'post', '/candidates', { ...w.candidate({ expectedSalary: '12000' }), jobId: mine.id })
      .expect(201);
    expect(res.body.viewer.canSeeSalary).toBe(true);
    expect(res.body.expectedSalary).toMatchObject({ amount: '12000.00' });
  });

  it('never reveals a duplicate the caller may not see', async () => {
    const dup = await w.as.recruiter
      .get(`/api/hiring/candidates/duplicates?email=${encodeURIComponent(otherCandidate.email)}`)
      .expect(200);
    expect(dup.body).toEqual([]);

    const res = await w
      .send('recruiter', 'post', '/candidates', { ...w.candidate({ email: otherCandidate.email }), jobId: mine.id })
      .expect(409);
    expect(res.body.code).toBe('candidate.duplicate');
    expect(res.body.details).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(otherCandidate.id);

    const hr = await w
      .send('hr', 'post', '/candidates', { ...w.candidate({ email: otherCandidate.email }), jobId: mine.id })
      .expect(409);
    expect(hr.body.details).toEqual({ candidateId: otherCandidate.id });
  });

  it('gives the Talent Acquisition Manager every job, candidate and salary', async () => {
    const list = await w.as.taManager.get('/api/hiring/jobs?pageSize=100').expect(200);
    expect(ids(list)).toEqual(expect.arrayContaining([mine.id, other.id]));
    const c = await w.as.taManager.get(`/api/hiring/candidates/${otherCandidate.id}`).expect(200);
    expect(c.body.viewer.canSeeSalary).toBe(true);
    expect(c.body.currentSalary).toMatchObject({ amount: '9000.00' });
    await w.as.taManager.get(`/api/hiring/applications/${otherApp}`).expect(200);
    await w.send('taManager', 'post', `/jobs/${other.id}/hold`).expect(200);
    await w.send('taManager', 'post', `/jobs/${other.id}/resume`).expect(200);
  });

  it('keeps requisitions and hiring reports away from the Recruiter', async () => {
    await w.as.recruiter.get('/api/hiring/requisitions').expect(403);
  });
});
