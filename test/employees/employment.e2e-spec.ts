import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Employment details: Directory → Edit (Super Admin, HR, Office Admin) changes name, placement, manager, type and
   joining date, with one audit row per save. The test edits GS-087 (Dubai, GSD · Sales, reports to GS-058) and puts
   everything back at the end. */
describe('Employee employment details', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as = {} as Record<keyof typeof PERSONA, Awaited<ReturnType<typeof signInAs>>>;
  const path = `/api/employees/${PERSONA.employee}/employment`;
  let original: {
    id: string;
    name: string;
    employmentType: string;
    dateOfJoining: string;
    company: { id: string };
    department: { id: string } | null;
    designation: { id: string } | null;
    location: { id: string };
    reportingManager: { id: string } | null;
  };
  let originalProfile: { seatingLocation: string | null; emergencyContacts: object[] };
  const ids = {} as Record<'gsit' | 'gsd' | 'gsitHr' | 'gsitHrExec' | 'gsitSalesAm' | 'teamLead' | 'employee', string>;

  const patch = (who: keyof typeof PERSONA, body: object, to = path) =>
    as[who].patch(to).set('Origin', ORIGIN).send(body);
  const audits = async () =>
    (
      await as.superAdmin
        .get(`/api/admin/audit?action=employee.employment_updated&entityId=${ids.employee}&pageSize=200`)
        .expect(200)
    ).body as {
      total: number;
      items: { before: Record<string, unknown>; after: Record<string, unknown> }[];
    };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const [k, code] of Object.entries(PERSONA)) as[k as keyof typeof PERSONA] = await signInAs(app, code);
    original = (await as.hr.get(`/api/employees/${PERSONA.employee}`).expect(200)).body;
    originalProfile = (await as.hr.get(`/api/employees/${PERSONA.employee}/profile`).expect(200)).body;
    ids.employee = original.id;
    ids.teamLead = (await as.hr.get(`/api/employees/${PERSONA.teamLead}`).expect(200)).body.id;
    const co = async (shortCode: string) => (await prisma.company.findUniqueOrThrow({ where: { shortCode } })).id;
    ids.gsit = await co('GSIT');
    ids.gsd = await co('GSD');
    const dept = async (companyId: string, name: string) =>
      (await prisma.department.findFirstOrThrow({ where: { companyId, name } })).id;
    ids.gsitHr = await dept(ids.gsit, 'HR');
    ids.gsitHrExec = (
      await prisma.designation.findFirstOrThrow({ where: { departmentId: ids.gsitHr, title: 'HR Executive' } })
    ).id;
    const gsitSales = await dept(ids.gsit, 'Sales');
    ids.gsitSalesAm = (
      await prisma.designation.findFirstOrThrow({ where: { departmentId: gsitSales, title: 'Account Manager' } })
    ).id;
  });

  afterAll(async () => {
    await patch('hr', {
      fullName: original.name,
      locationId: original.location.id,
      companyId: original.company.id,
      departmentId: original.department?.id ?? null,
      designationId: original.designation?.id ?? null,
      reportingManagerId: original.reportingManager?.id ?? null,
      employmentType: original.employmentType,
      dateOfJoining: original.dateOfJoining,
    }).expect(200);
    await patch(
      'hr',
      { seatingLocation: originalProfile.seatingLocation, emergencyContacts: originalProfile.emergencyContacts },
      `/api/employees/${PERSONA.employee}/profile`,
    ).expect(200);
    await app.close();
  });

  it.each(['employee', 'teamLead', 'taManager', 'recruiter'] as const)('%s cannot edit (403)', async (who) => {
    const res = await patch(who, { employmentType: 'CONTRACT' }).expect(403);
    expect(res.body.code).toBe('employee.edit_not_allowed');
  });

  it('an unknown employee is 404', async () => {
    await patch('hr', { employmentType: 'CONTRACT' }, '/api/employees/GS-999/employment').expect(404);
  });

  it('HR changes name, type and joining date with one audit row of readable values', async () => {
    const before = (await audits()).total;
    const res = await patch('hr', {
      fullName: 'Dev Employee Edited',
      employmentType: 'CONTRACT',
      dateOfJoining: '2024-04-01',
    }).expect(200);
    expect(res.body).toMatchObject({
      name: 'Dev Employee Edited',
      employmentType: 'CONTRACT',
      dateOfJoining: '2024-04-01',
    });
    const log = await audits();
    expect(log.total).toBe(before + 1);
    expect(log.items[0]!.after).toEqual({
      name: 'Dev Employee Edited',
      employmentType: 'Contract',
      dateOfJoining: '2024-04-01',
    });

    // The same values again change nothing and write nothing.
    await patch('officeAdmin', { fullName: 'Dev Employee Edited', employmentType: 'CONTRACT' }).expect(200);
    expect((await audits()).total).toBe(before + 1);
  });

  it('BR-EMP-002: organization, department and designation must fit together and the location', async () => {
    // GSD only operates in Dubai.
    const away = await patch('hr', { locationId: 'Kochi' }).expect(400);
    expect(away.body.details.fields.join(' ')).toMatch(/Organization does not operate/);
    // A designation from another department.
    await patch('hr', { companyId: ids.gsit, departmentId: ids.gsitHr, designationId: ids.gsitSalesAm }).expect(400);
    // A department of another organization.
    await patch('hr', { departmentId: ids.gsitHr, designationId: null }).expect(400);
  });

  it('BR-EMP-001: moving to India switches emergency contact groups and drops a Dubai seat', async () => {
    const res = await patch('hr', {
      locationId: 'Kochi',
      companyId: ids.gsit,
      departmentId: ids.gsitHr,
      designationId: ids.gsitHrExec,
    }).expect(200);
    expect(res.body).toMatchObject({
      location: { id: 'Kochi' },
      company: { id: ids.gsit },
      department: { id: ids.gsitHr },
      designation: { id: ids.gsitHrExec },
    });
    const profile = (await as.hr.get(`/api/employees/${PERSONA.employee}/profile`).expect(200)).body;
    const groups = profile.emergencyContacts.map((c: { group: string }) => c.group);
    expect(groups.every((g: string) => ['Primary Emergency Contact', 'Alternate Emergency Contact'].includes(g))).toBe(
      true,
    );
    if (originalProfile.seatingLocation) expect(profile.seatingLocation).toBeNull();
    expect((await audits()).items[0]!.after).toMatchObject({
      location: expect.any(String),
      organization: expect.any(String),
      department: 'HR',
    });
  });

  it('BR-EMP-003: no self-reporting and no cycles in the reporting line', async () => {
    await patch('hr', { reportingManagerId: ids.employee }).expect(400);
    // GS-087 reports to GS-058, so GS-058 cannot report to GS-087.
    const cycle = await patch(
      'hr',
      { reportingManagerId: ids.employee },
      `/api/employees/${PERSONA.teamLead}/employment`,
    ).expect(400);
    expect(cycle.body.details.fields.join(' ')).toMatch(/reports to this employee/);
    // Clearing the manager is allowed.
    expect((await patch('hr', { reportingManagerId: null }).expect(200)).body.reportingManager).toBeNull();
  });

  it('BR-EMP-004 and validation: no email, code or status; required fields cannot be cleared', async () => {
    await patch('hr', { email: 'someone@example.com' }).expect(400);
    await patch('hr', { employmentStatus: 'INACTIVE' }).expect(400);
    await patch('hr', { employeeCode: 'GS-999' }).expect(400);
    await patch('hr', { fullName: null }).expect(400);
    await patch('hr', { fullName: '   ' }).expect(400);
    await patch('hr', { companyId: null }).expect(400);
    await patch('hr', { employmentType: 'INTERN' }).expect(400);
    await patch('hr', { dateOfJoining: '2024-02-31' }).expect(400);
    await patch('hr', { reportingManagerId: '0190f0f0-0000-7000-8000-000000000000' }).expect(400);
  });
});
