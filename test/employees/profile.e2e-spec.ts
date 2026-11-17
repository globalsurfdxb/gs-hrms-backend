import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Employee profile: anyone who can see the person reads it (data scope); Directory → Edit (Super Admin, HR, Office
   Admin) changes it, with one audit row per save. The test edits GS-087 and puts the original back at the end. */
describe('Employee profile', () => {
  let app: INestApplication<App>;
  const as = {} as Record<keyof typeof PERSONA, Awaited<ReturnType<typeof signInAs>>>;
  const path = `/api/employees/${PERSONA.employee}/profile`;
  let original: Record<string, unknown>;
  let employeeId: string;

  const patch = (who: keyof typeof PERSONA, body: object) => as[who].patch(path).set('Origin', ORIGIN).send(body);
  const audits = async () => {
    const res = await as.superAdmin
      .get(`/api/admin/audit?action=employee.profile_updated&entityId=${employeeId}&pageSize=200`)
      .expect(200);
    return res.body as { total: number; items: { before: Record<string, unknown>; after: Record<string, unknown> }[] };
  };

  beforeAll(async () => {
    app = await createTestApp();
    for (const [k, code] of Object.entries(PERSONA)) as[k as keyof typeof PERSONA] = await signInAs(app, code);
    const res = await as.hr.get(path).expect(200);
    original = res.body;
    employeeId = (await as.hr.get(`/api/employees/${PERSONA.employee}`).expect(200)).body.id;
  });
  afterAll(async () => {
    const { employeeCode: _code, canEdit: _canEdit, ...body } = original;
    await patch('hr', body).expect(200);
    await app.close();
  });

  it('is read within the data scope; out of scope is 404', async () => {
    const own = await as.employee.get(path).expect(200);
    expect(own.body).toMatchObject({ employeeCode: PERSONA.employee, canEdit: false });
    expect(Array.isArray(own.body.emergencyContacts)).toBe(true);

    const lead = await as.teamLead.get(path).expect(200);
    expect(lead.body.canEdit).toBe(false);
    expect((await as.hr.get(path).expect(200)).body.canEdit).toBe(true);

    const out = await as.employee.get(`/api/employees/${PERSONA.teamLead}/profile`).expect(404);
    expect(out.body.code).toBe('employee.not_found');
    await as.superAdmin.get('/api/employees/GS-999/profile').expect(404);
  });

  it.each(['employee', 'teamLead', 'taManager', 'recruiter'] as const)('%s cannot edit (403)', async (who) => {
    const res = await patch(who, { personalMobile: '+971 50 111 2222' }).expect(403);
    expect(res.body.code).toBe('employee.edit_not_allowed');
  });

  it('HR saves fields and lists, with one audit row listing only what changed', async () => {
    const before = (await audits()).total;
    const res = await patch('hr', {
      personalMobile: '+971 50 123 4567',
      bloodGroup: 'AB-',
      middleName: 'Test',
      emergencyContacts: [
        {
          group: 'Local Emergency Contact (UAE)',
          name: 'Pat Example',
          relationship: 'Spouse',
          mobile: '+971 55 222 3333',
        },
      ],
      experience: [{ company: 'Example Co', fromDate: '2015-01-01', toDate: '2017-06-30', workMode: 'Hybrid' }],
    }).expect(200);
    expect(res.body).toMatchObject({
      personalMobile: '+971 50 123 4567',
      bloodGroup: 'AB-',
      middleName: 'Test',
      emergencyContacts: [{ name: 'Pat Example', group: 'Local Emergency Contact (UAE)' }],
      experience: [
        { company: 'Example Co', fromDate: '2015-01-01', toDate: '2017-06-30', workMode: 'Hybrid', title: '' },
      ],
    });
    // Lists not sent are left alone.
    expect(res.body.education).toEqual(original.education);

    const log = await audits();
    expect(log.total).toBe(before + 1);
    expect(log.items[0].after).toEqual({
      middleName: 'Test',
      bloodGroup: 'AB-',
      personalMobile: '+971 50 123 4567',
      emergencyContacts: 'Pat Example',
      experience: '1 entry',
    });
  });

  it('a blank field clears it, and a save that changes nothing writes no audit row', async () => {
    const cleared = await patch('officeAdmin', { middleName: '' }).expect(200);
    expect(cleared.body.middleName).toBeNull();

    const before = (await audits()).total;
    const { employeeCode: _c, canEdit: _e, ...same } = cleared.body;
    await patch('hr', same).expect(200);
    expect((await audits()).total).toBe(before);
  });

  it('rejects invalid values and fields that are not part of the profile', async () => {
    const india = await patch('hr', {
      emergencyContacts: [
        { group: 'Primary Emergency Contact', name: 'A', relationship: 'B', mobile: '+91 90000 00000' },
      ],
    }).expect(400);
    expect(india.body.code).toBe('request.invalid');
    expect(india.body.details.fields.join(' ')).toMatch(/Contact group/);

    await patch('hr', { gender: 'Unknown' }).expect(400);
    await patch('hr', { personalMobile: 'call me' }).expect(400);
    await patch('hr', { dateOfBirth: '2100-01-01' }).expect(400);
    await patch('hr', { experience: [{ company: 'X', fromDate: '2020-01-01', toDate: '2019-01-01' }] }).expect(400);
    await patch('hr', { salary: 99999 }).expect(400);
    await patch('hr', { employmentStatus: 'INACTIVE' }).expect(400);
  });
});
