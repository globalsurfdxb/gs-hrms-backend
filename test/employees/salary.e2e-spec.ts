import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Salary structure: reads by Salary → View (or your own), replaces by Salary → Edit (never your own), audited
   without amounts. The test edits GS-087 (Dubai, AED) and puts the salary and placement back at the end. */
describe('Employee salary', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as = {} as Record<keyof typeof PERSONA, Awaited<ReturnType<typeof signInAs>>>;
  const path = (code: string = PERSONA.employee) => `/api/employees/${code}/salary`;
  let employeeId: string;
  let savedRows: { kind: 'EARNING' | 'DEDUCTION'; position: number; label: string; amount: unknown }[];
  let placement: Record<string, unknown>;

  const put = (who: keyof typeof PERSONA, body: object, to = path()) =>
    as[who].put(to).set('Origin', ORIGIN).send(body);
  const audits = async (action: string) =>
    (await as.superAdmin.get(`/api/admin/audit?action=${action}&entityId=${employeeId}&pageSize=200`).expect(200))
      .body as { total: number; items: { module: string; before: unknown; after: Record<string, unknown> }[] };
  const BASE = {
    earnings: [
      { label: 'Basic Salary', amount: '9000' },
      { label: 'Transportation Allowance', amount: '800.5' },
      { label: 'Accommodation Allowance', amount: '3600' },
    ],
    deductions: [{ label: 'Advance', amount: '500' }],
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const [k, code] of Object.entries(PERSONA)) as[k as keyof typeof PERSONA] = await signInAs(app, code);
    const e = (await as.hr.get(`/api/employees/${PERSONA.employee}`).expect(200)).body;
    employeeId = e.id;
    placement = {
      locationId: e.location.id,
      companyId: e.company.id,
      departmentId: e.department?.id ?? null,
      designationId: e.designation?.id ?? null,
    };
    savedRows = await prisma.salaryComponent.findMany({
      where: { employeeId },
      select: { kind: true, position: true, label: true, amount: true },
    });
    await put('hr', BASE).expect(200);
  });

  afterAll(async () => {
    await as.hr.patch(`/api/employees/${PERSONA.employee}/employment`).set('Origin', ORIGIN).send(placement);
    await prisma.salaryComponent.deleteMany({ where: { employeeId } });
    if (savedRows.length) {
      await prisma.salaryComponent.createMany({ data: savedRows.map((r) => ({ ...r, employeeId }) as never) });
    }
    await app.close();
  });

  it('HR reads it with totals in AED, and may edit', async () => {
    const res = await as.hr.get(path()).expect(200);
    expect(res.body).toEqual({
      employeeCode: PERSONA.employee,
      template: 'UAE',
      currency: 'AED',
      earnings: [
        { label: 'Basic Salary', amount: '9000.00' },
        { label: 'Transportation Allowance', amount: '800.50' },
        { label: 'Accommodation Allowance', amount: '3600.00' },
      ],
      deductions: [{ label: 'Advance', amount: '500.00' }],
      totalEarnings: '13400.50',
      totalDeductions: '500.00',
      netPay: '12900.50',
      canEdit: true,
    });
  });

  it("viewing someone else's salary is audited without amounts; reading your own is not", async () => {
    const before = (await audits('employee.salary_viewed')).total;
    await as.superAdmin.get(path()).expect(200);
    const after = await audits('employee.salary_viewed');
    expect(after.total).toBe(before + 1);
    expect(after.items[0].module).toBe('Salary');
    expect(JSON.stringify(after.items[0])).not.toContain('9000');

    await as.employee.get(path()).expect(200);
    expect((await audits('employee.salary_viewed')).total).toBe(before + 1);
  });

  it('an employee reads their own salary, without edit', async () => {
    const res = await as.employee.get(path()).expect(200);
    expect(res.body).toMatchObject({ netPay: '12900.50', canEdit: false });
  });

  it.each(['employee', 'teamLead', 'officeAdmin', 'taManager', 'recruiter'] as const)(
    "%s cannot read someone else's salary (404)",
    async (who) => {
      const other = who === 'employee' ? PERSONA.teamLead : PERSONA.employee;
      await as[who].get(path(other)).expect(404);
    },
  );

  it.each(['employee', 'teamLead', 'officeAdmin', 'taManager', 'recruiter'] as const)(
    '%s cannot change a salary (403)',
    async (who) => {
      const res = await put(who, BASE).expect(403);
      expect(res.body.code).toBe('employee.salary_edit_not_allowed');
    },
  );

  it('HR cannot change their own salary (403), and does not get canEdit on it', async () => {
    const res = await put('hr', BASE, path(PERSONA.hr)).expect(403);
    expect(res.body.code).toBe('employee.salary_own_edit_not_allowed');
    expect((await as.hr.get(path(PERSONA.hr)).expect(200)).body.canEdit).toBe(false);
  });

  it('a change is audited under Salary with names only; no change writes no row', async () => {
    const before = (await audits('employee.salary_updated')).total;
    await put('hr', BASE).expect(200);
    expect((await audits('employee.salary_updated')).total).toBe(before);

    const res = await put('hr', {
      earnings: [...BASE.earnings.slice(0, 2), { label: 'Accommodation Allowance', amount: '4000' }],
      deductions: [],
    }).expect(200);
    expect(res.body).toMatchObject({ totalEarnings: '13800.50', totalDeductions: '0.00', netPay: '13800.50' });

    const log = await audits('employee.salary_updated');
    expect(log.total).toBe(before + 1);
    expect(log.items[0]).toMatchObject({
      module: 'Salary',
      before: { deductions: ['Advance'] },
      after: { deductions: [], amountsChanged: true },
    });
    expect(JSON.stringify(log.items[0])).not.toMatch(/4000|3600|500/);
  });

  it('validation: names, duplicates, amounts, size and net pay', async () => {
    const bad = async (body: object) => put('hr', body).expect(400);
    await bad({ earnings: [{ label: '', amount: '1' }], deductions: [] });
    await bad({
      earnings: [
        { label: 'Basic', amount: '1' },
        { label: ' basic ', amount: '2' },
      ],
      deductions: [],
    });
    await bad({ earnings: [{ label: 'Basic', amount: '-1' }], deductions: [] });
    await bad({ earnings: [{ label: 'Basic', amount: '1.005' }], deductions: [] });
    await bad({ earnings: [{ label: 'Basic', amount: 1000 }], deductions: [] });
    await bad({ earnings: [{ label: 'Basic', amount: '100' }], deductions: [{ label: 'Advance', amount: '101' }] });
    await bad({ earnings: Array.from({ length: 21 }, (_, i) => ({ label: `L${i}`, amount: '1' })), deductions: [] });
    await bad({ earnings: [] });
    await bad({ ...BASE, currency: 'USD' });
  });

  it('a move to India keeps the amounts, switches to INR and notes it on the move', async () => {
    const gsit = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    const hr = await prisma.department.findFirstOrThrow({ where: { companyId: gsit.id, name: 'HR' } });
    const exec = await prisma.designation.findFirstOrThrow({ where: { departmentId: hr.id, title: 'HR Executive' } });
    await as.hr
      .patch(`/api/employees/${PERSONA.employee}/employment`)
      .set('Origin', ORIGIN)
      .send({ locationId: 'Kochi', companyId: gsit.id, departmentId: hr.id, designationId: exec.id })
      .expect(200);

    const res = await as.hr.get(path()).expect(200);
    expect(res.body).toMatchObject({ template: 'INDIA', currency: 'INR', netPay: '13800.50' });
    const moved = await audits('employee.employment_updated');
    expect(moved.items[0].after).toMatchObject({ salaryCurrency: 'INR — amounts kept, review them' });
  });
});
