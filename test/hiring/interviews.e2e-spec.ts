import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../app.js';
import { hiringWorld, type Who } from './hiring-fixtures.js';

/* Interviews (hiring step 4, BR-HIR-010) and the My Space pages /me/interviews and /me/referrals. Jobs come from the
   fixture: Dubai, hiring manager GS-058 (Team Lead), recruited by the Talent Acquisition Manager. Interviews land on
   a random day well ahead, so runs on the shared e2e database do not clash with each other. */
describe('Interviews API', () => {
  let app: INestApplication<App>;
  let w: Awaited<ReturnType<typeof hiringWorld>>;
  const day = new Date(Date.now() + randomInt(200, 2000) * 86_400_000).toISOString().slice(0, 10);

  async function onNewJob(patch: Record<string, unknown> = {}) {
    const job = await w.job();
    const c = (await w.send('hr', 'post', '/candidates', w.candidate({ jobId: job.id, ...patch })).expect(201)).body;
    return { job, candidate: c, appId: c.applications[0].id as string };
  }
  const body = (appId: string, patch: Record<string, unknown> = {}) => ({
    applicationId: appId,
    round: 'TECHNICAL',
    date: day,
    time: '10:00',
    durationMin: 60,
    mode: 'TEAMS',
    panelIds: [w.id.teamLead],
    link: 'https://teams.microsoft.com/l/meetup-join/test',
    notes: 'Focus on firewall design.',
    ...patch,
  });
  const get = (who: Who, path: string) => w.as[who].get(`/api/hiring${path}`);
  const schedule = (who: Who, b: object) => w.send(who, 'post', '/interviews', b);

  beforeAll(async () => {
    app = await createTestApp();
    w = await hiringWorld(app);
  });
  afterAll(() => app.close());

  it('schedules in the location’s local time, moves the candidate forward and audits without notes', async () => {
    const { appId, candidate } = await onNewJob();
    const res = await schedule('hr', body(appId)).expect(201);
    expect(res.body).toMatchObject({
      round: 'TECHNICAL',
      date: day,
      time: '10:00',
      timezone: 'Asia/Dubai',
      startsAt: `${day}T06:00:00.000Z`,
      endsAt: `${day}T07:00:00.000Z`,
      status: 'SCHEDULED',
      rescheduleCount: 0,
      candidate: { id: candidate.id, name: candidate.name },
      location: { id: 'Dubai' },
      panel: [{ id: w.id.teamLead }],
      application: { id: appId, stage: 'TECHNICAL_INTERVIEW' },
      viewer: { canEdit: true },
    });

    const a = (await get('hr', `/applications/${appId}`).expect(200)).body;
    expect(a.history.at(-1)).toMatchObject({
      from: 'APPLIED',
      to: 'TECHNICAL_INTERVIEW',
      note: 'Interview scheduled: Technical interview',
    });

    // A screening call afterwards does not move the candidate back.
    const call = await schedule('hr', body(appId, { round: 'SCREENING_CALL', time: '15:00' })).expect(201);
    expect(call.body.application.stage).toBe('TECHNICAL_INTERVIEW');

    const audit = (await w.as.superAdmin.get(`/api/admin/audit?action=interview.scheduled&entityId=${res.body.id}`))
      .body.items[0];
    expect(audit).toMatchObject({ module: 'Hiring', after: { round: 'TECHNICAL', durationMin: 60, hasLink: true } });
    expect(JSON.stringify(audit)).not.toContain('firewall');
    expect(JSON.stringify(audit)).not.toContain('teams.microsoft.com');
  });

  it('validates time, duration, panel and link', async () => {
    const { appId } = await onNewJob();
    const code = async (patch: Record<string, unknown>) =>
      (await schedule('hr', body(appId, patch)).expect(400)).body.code;
    expect(await code({ date: '2020-01-01' })).toBe('interview.in_past');
    expect(await code({ date: '2027-02-30' })).toBe('interview.invalid_time');
    expect(await code({ link: 'http://teams.example.com/x' })).toBe('interview.invalid_link');
    expect(await code({ panelIds: [w.id.teamLead, '01999999-0000-7000-8000-000000000000'] })).toBe(
      'interview.invalid_panel',
    );
    expect(await code({ panelIds: [] })).toBe('request.invalid');
    expect(await code({ durationMin: 50 })).toBe('request.invalid');
    expect(await code({ time: '9:00' })).toBe('request.invalid');
    expect(await code({ round: 'CULTURE' })).toBe('request.invalid');
  });

  it('warns about overlapping panel bookings (not only identical start times), names only', async () => {
    const { appId } = await onNewJob();
    const first = (await schedule('hr', body(appId, { time: '12:00', panelIds: [w.id.hr, w.id.teamLead] })).expect(201))
      .body;
    const q = (time: string, extra = '') =>
      get(
        'hr',
        `/interviews/clashes?applicationId=${appId}&date=${day}&time=${time}&durationMin=60` +
          `&panelIds=${w.id.hr},${w.id.superAdmin}${extra}`,
      ).expect(200);
    expect((await q('12:30')).body.clashes).toEqual([expect.objectContaining({ id: w.id.hr })]);
    expect((await q('13:00')).body.clashes).toEqual([]);
    expect((await q('11:00')).body.clashes).toEqual([]);
    expect((await q('12:30', `&excludeId=${first.id}`)).body.clashes).toEqual([]);
    expect(JSON.stringify((await q('12:30')).body)).not.toContain(appId);
    // Only a warning: the overlapping interview can still be booked.
    await schedule('hr', body(appId, { round: 'HR', time: '12:30', panelIds: [w.id.hr] })).expect(201);
  });

  it('reschedules, completes and cancels only a scheduled interview', async () => {
    const { appId } = await onNewJob();
    const i = (await schedule('hr', body(appId, { time: '09:00' })).expect(201)).body;

    const moved = await w
      .send('hr', 'put', `/interviews/${i.id}`, {
        date: day,
        time: '16:30',
        durationMin: 45,
        mode: 'IN_PERSON',
        link: '',
      })
      .expect(200);
    expect(moved.body).toMatchObject({
      time: '16:30',
      durationMin: 45,
      mode: 'IN_PERSON',
      link: '',
      rescheduleCount: 1,
    });
    // The same details again change nothing.
    const same = await w.send('hr', 'put', `/interviews/${i.id}`, { date: day, time: '16:30' }).expect(200);
    expect(same.body.rescheduleCount).toBe(1);

    const done = await w.send('hr', 'post', `/interviews/${i.id}/complete`).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', viewer: { canEdit: false } });
    for (const action of ['complete', 'cancel']) {
      expect((await w.send('hr', 'post', `/interviews/${i.id}/${action}`).expect(409)).body.code).toBe(
        'interview.not_scheduled',
      );
    }
    expect((await w.send('hr', 'put', `/interviews/${i.id}`, { date: day, time: '17:00' }).expect(409)).body.code).toBe(
      'interview.not_scheduled',
    );

    const other = (await schedule('hr', body(appId, { round: 'HR', time: '11:00' })).expect(201)).body;
    expect((await w.send('hr', 'post', `/interviews/${other.id}/cancel`).expect(200)).body.status).toBe('CANCELLED');

    const past = (await get('hr', `/interviews?when=past&applicationId=${appId}`).expect(200)).body;
    expect(past.items.map((x: { id: string }) => x.id).sort()).toEqual([i.id, other.id].sort());
    const upcoming = (await get('hr', `/interviews?applicationId=${appId}`).expect(200)).body;
    expect(upcoming.total).toBe(0);
  });

  it('refuses a candidate who left the pipeline', async () => {
    const { appId } = await onNewJob();
    const i = (await schedule('hr', body(appId, { time: '08:00' })).expect(201)).body;
    await w.send('hr', 'post', `/applications/${appId}/exit`, { exit: 'WITHDRAWN', reason: 'Took another offer' });
    expect((await schedule('hr', body(appId)).expect(409)).body.code).toBe('interview.application_inactive');
    expect((await w.send('hr', 'put', `/interviews/${i.id}`, { date: day, time: '08:30' }).expect(409)).body.code).toBe(
      'interview.application_inactive',
    );
    // Cancelling it is still possible.
    await w.send('hr', 'post', `/interviews/${i.id}/cancel`).expect(200);
  });

  it('is limited to Interviews permission holders, and to own jobs without full access (BR-HIR-022)', async () => {
    const { appId } = await onNewJob();
    const i = (await schedule('taManager', body(appId, { time: '14:00' })).expect(201)).body;

    for (const who of ['employee', 'officeAdmin', 'teamLead'] as const) {
      await get(who, '/interviews').expect(403);
      await schedule(who, body(appId)).expect(403);
    }
    // The Recruiter persona is not this job's recruiter: the interview and the application are not theirs.
    await get('recruiter', `/interviews/${i.id}`).expect(404);
    await schedule('recruiter', body(appId)).expect(404);
    await w.send('recruiter', 'post', `/interviews/${i.id}/cancel`).expect(404);
    const listed = (await get('recruiter', '/interviews?when=all&pageSize=100').expect(200)).body;
    expect(listed.items.some((x: { id: string }) => x.id === i.id)).toBe(false);

    // On a job they recruit for, they can.
    const own = await w.job(true, 'recruiter');
    const c = (await w.send('recruiter', 'post', '/candidates', w.candidate({ jobId: own.id })).expect(201)).body;
    await schedule('recruiter', body(c.applications[0].id, { time: '15:00' })).expect(201);
  });

  it('My interviews: what a panelist sees, whatever their role', async () => {
    const { appId, candidate } = await onNewJob();
    const i = (await schedule('hr', body(appId, { time: '17:00', panelIds: [w.id.employee, w.id.hr] })).expect(201))
      .body;

    const mine = (await w.as.employee.get('/api/me/interviews').expect(200)).body;
    const row = mine.upcoming.find((x: { id: string }) => x.id === i.id);
    expect(row).toMatchObject({
      candidateName: candidate.name,
      round: 'TECHNICAL',
      date: day,
      time: '17:00',
      otherPanel: [{ id: w.id.hr }],
      status: 'SCHEDULED',
    });
    expect(JSON.stringify(row)).not.toContain(candidate.email);

    const notMine = (await w.as.teamLead.get('/api/me/interviews').expect(200)).body;
    expect([...notMine.upcoming, ...notMine.past].some((x: { id: string }) => x.id === i.id)).toBe(false);
  });

  it('My referrals: status only, and the open roles that take referrals', async () => {
    const job = await w.job();
    const c = (
      await w
        .send(
          'hr',
          'post',
          '/candidates',
          w.candidate({ jobId: job.id, source: 'EMPLOYEE_REFERRAL', referrerId: w.id.employee }),
        )
        .expect(201)
    ).body;

    const mine = (await w.as.employee.get('/api/me/referrals').expect(200)).body;
    expect(mine.referrals).toContainEqual({
      id: c.applications[0].id,
      candidateName: c.name,
      jobTitle: 'Network Engineer',
      referredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      status: 'RECEIVED',
    });
    expect(mine.openRoles.some((r: { jobId: string }) => r.jobId === job.id)).toBe(true);

    const someoneElse = (await w.as.teamLead.get('/api/me/referrals').expect(200)).body;
    expect(someoneElse.referrals.some((r: { id: string }) => r.id === c.applications[0].id)).toBe(false);
  });
});
