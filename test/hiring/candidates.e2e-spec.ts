import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../app.js';
import { hiringWorld, type Who } from './hiring-fixtures.js';

/* Candidates (hiring step 3): add (optionally onto an open job), duplicate check, add to another job, tags, notes,
   salary rules, and access for HR / Super Admin only. */
describe('Candidates API', () => {
  let app: INestApplication<App>;
  let w: Awaited<ReturnType<typeof hiringWorld>>;
  let openJob: { id: string; code: string };

  beforeAll(async () => {
    app = await createTestApp();
    w = await hiringWorld(app);
    openJob = await w.job();
  });
  afterAll(() => app.close());

  it('adds a candidate onto an open job, with the application, location, note and an audit row without salary', async () => {
    const res = await w
      .send('hr', 'post', '/candidates', {
        ...w.candidate({ email: `Priya.${randomUUID()}@Example.com` }),
        jobId: openJob.id,
        currentSalary: '9000',
        expectedSalary: '11000.50',
        tags: ['Shortlisted', ' shortlisted ', 'Fortinet NSE4'],
        cvName: 'Priya_Nair_CV.pdf',
        note: 'Strong SD-WAN background.',
      })
      .expect(201);
    const c = res.body;
    expect(c.email).toBe(c.email.toLowerCase());
    expect(c).toMatchObject({
      location: { id: 'Dubai' },
      tags: ['Shortlisted', 'Fortinet NSE4'],
      cvName: 'Priya_Nair_CV.pdf',
      currentSalary: { amount: '9000.00', currency: 'AED' },
      expectedSalary: { amount: '11000.50', currency: 'AED' },
      viewer: { canEdit: true, canAddApplication: true, canSeeSalary: true },
    });
    expect(c.notes).toHaveLength(1);
    expect(c.applications).toHaveLength(1);
    expect(c.applications[0]).toMatchObject({ job: { id: openJob.id }, stage: 'APPLIED', exit: null });
    expect(c.applications[0].history).toMatchObject([{ from: null, to: 'APPLIED' }]);

    const audit = await w.prisma.auditLog.findFirstOrThrow({ where: { entityType: 'candidate', entityId: c.id } });
    expect(audit.action).toBe('candidate.created');
    expect(audit.after).toMatchObject({ currentSalary: 'set', expectedSalary: 'set' });
    expect(JSON.stringify(audit.after)).not.toContain('9000');

    // Viewing a record with salary is audited.
    await w.as.hr.get(`/api/hiring/candidates/${c.id}`).expect(200);
    const viewed = await w.prisma.auditLog.count({ where: { entityId: c.id, action: 'candidate.salary_viewed' } });
    expect(viewed).toBe(1);
  });

  it('refuses a duplicate by email or phone and points at the existing candidate (BR-HIR-007)', async () => {
    const body = w.candidate({ locationId: 'Dubai' });
    const first = (await w.send('hr', 'post', '/candidates', body).expect(201)).body;

    const byEmail = await w
      .send('hr', 'post', '/candidates', w.candidate({ locationId: 'Dubai', email: body.email.toUpperCase() }))
      .expect(409);
    expect(byEmail.body).toMatchObject({ code: 'candidate.duplicate', details: { candidateId: first.id } });
    const digits = body.phone.replace(/\D/g, '').slice(-9);
    const byPhone = await w
      .send('hr', 'post', '/candidates', w.candidate({ locationId: 'Dubai', phone: `00971-${digits}` }))
      .expect(409);
    expect(byPhone.body.details.candidateId).toBe(first.id);

    const found = await w.as.hr
      .get('/api/hiring/candidates/duplicates')
      .query({ email: body.email, phone: '' })
      .expect(200);
    expect(found.body.map((d: { id: string }) => d.id)).toEqual([first.id]);
  });

  it('validates the input and refuses jobs that are not open', async () => {
    const code = async (patch: Record<string, unknown>, status = 400) =>
      (await w.send('hr', 'post', '/candidates', w.candidate({ locationId: 'Dubai', ...patch })).expect(status)).body
        .code;
    expect(await code({ consent: false })).toBe('candidate.consent_required');
    expect(await code({ source: 'EMPLOYEE_REFERRAL' })).toBe('candidate.referrer_required');
    expect(await code({ source: 'AGENCY' })).toBe('candidate.agency_required');
    expect(await code({ locationId: undefined })).toBe('candidate.location_required');
    expect(await code({ cvName: '../../etc/passwd' })).toBe('request.invalid');
    expect(await code({ employeeId: 'x' })).toBe('request.invalid');
    const draft = await w.job(false);
    expect(await code({ jobId: draft.id }, 409)).toBe('application.job_not_open');
    expect(await code({ jobId: randomUUID() }, 404)).toBe('job.not_found');
  });

  it('adds an existing candidate to another open job once (BR-HIR-008)', async () => {
    const c = (await w.send('hr', 'post', '/candidates', w.candidate({ jobId: openJob.id })).expect(201)).body;
    const other = await w.job();
    const applied = await w
      .send('superAdmin', 'post', `/candidates/${c.id}/applications`, { jobId: other.id })
      .expect(201);
    expect(applied.body).toMatchObject({ stage: 'APPLIED', job: { id: other.id }, candidate: { id: c.id } });
    const again = await w.send('hr', 'post', `/candidates/${c.id}/applications`, { jobId: other.id }).expect(409);
    expect(again.body.code).toBe('application.already_applied');

    const list = await w.as.hr.get('/api/hiring/candidates').query({ jobId: other.id }).expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect(list.body.items[0]).not.toHaveProperty('currentSalary');
  });

  it('replaces tags and appends notes, which the database keeps append-only', async () => {
    const c = (await w.send('hr', 'post', '/candidates', w.candidate({ locationId: 'Kochi' })).expect(201)).body;
    expect(c.location.id).toBe('Kochi');
    const tagged = await w
      .send('hr', 'put', `/candidates/${c.id}/tags`, { tags: ['Java', ' java ', 'Remote'] })
      .expect(200);
    expect(tagged.body.tags).toEqual(['Java', 'Remote']);
    const noted = await w
      .send('hr', 'post', `/candidates/${c.id}/notes`, { text: ' Asked for 45 days notice. ' })
      .expect(201);
    expect(noted.body.notes[0]).toMatchObject({ text: 'Asked for 45 days notice.', by: { id: w.id.hr } });

    const where = { candidateId: c.id };
    await expect(w.prisma.candidateNote.updateMany({ where, data: { text: 'x' } })).rejects.toThrow(/append-only/);
    await expect(w.prisma.candidateNote.deleteMany({ where })).rejects.toThrow(/append-only/);
    const actions = (await w.prisma.auditLog.findMany({ where: { entityId: c.id }, orderBy: { at: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(['candidate.created', 'candidate.tags_changed', 'candidate.note_added']);
  });

  it.each(['teamLead', 'officeAdmin', 'employee'] as Who[])('gives %s no access to candidates', async (who) => {
    const c = (await w.send('hr', 'post', '/candidates', w.candidate({ locationId: 'Dubai' })).expect(201)).body;
    await w.as[who].get('/api/hiring/candidates').expect(403);
    await w.as[who].get(`/api/hiring/candidates/${c.id}`).expect(403);
    await w.as[who].get('/api/hiring/candidates/duplicates').query({ email: c.email }).expect(403);
    await w.send(who, 'post', '/candidates', w.candidate({ locationId: 'Dubai' })).expect(403);
    await w.send(who, 'post', `/candidates/${c.id}/applications`, { jobId: openJob.id }).expect(403);
    await w.send(who, 'put', `/candidates/${c.id}/tags`, { tags: ['x'] }).expect(403);
    await w.send(who, 'post', `/candidates/${c.id}/notes`, { text: 'x' }).expect(403);
  });

  it('returns 404 for an unknown candidate', async () => {
    await w.as.hr.get(`/api/hiring/candidates/${randomUUID()}`).expect(404);
    await w.send('hr', 'post', `/candidates/${randomUUID()}/notes`, { text: 'x' }).expect(404);
  });
});
