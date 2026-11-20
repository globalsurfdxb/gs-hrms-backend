import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

/* Identity, bank and PF details: masked reads, edits by Identity & bank → Edit, audited reveals. The test edits
   GS-087 (Dubai, UAE template) and puts the row and the placement back at the end. Numbers are fictional. */
describe('Employee identity & bank details', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const as = {} as Record<keyof typeof PERSONA, Awaited<ReturnType<typeof signInAs>>>;
  const path = (code: string = PERSONA.employee) => `/api/employees/${code}/identity-bank`;
  const IBAN = 'AE280330000010000000087'; // fictional, valid checksum
  let employeeId: string;
  let savedRow: Record<string, unknown> | null;
  let placement: Record<string, unknown>;

  const patch = (who: keyof typeof PERSONA, body: object, to = path()) =>
    as[who].patch(to).set('Origin', ORIGIN).send(body);
  const reveal = (who: keyof typeof PERSONA, field: string, code?: string) =>
    as[who]
      .post(`${path(code)}/reveal`)
      .set('Origin', ORIGIN)
      .send({ field });
  const audits = async (action: string) =>
    (await as.superAdmin.get(`/api/admin/audit?action=${action}&entityId=${employeeId}&pageSize=200`).expect(200))
      .body as { total: number; items: { module: string; before: unknown; after: Record<string, unknown> }[] };

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
    savedRow = await prisma.employeeIdentityBank.findUnique({ where: { employeeId } });
    // Start from a known UAE record.
    await patch('hr', {
      passportNumber: 'N1000087',
      emiratesId: '784-1990-0000087-1',
      paymentMode: 'WPS Transfer',
      bankName: 'Example Bank',
      accountNumber: 'AE220330000010000000001',
    }).expect(200);
  });

  afterAll(async () => {
    await as.hr.patch(`/api/employees/${PERSONA.employee}/employment`).set('Origin', ORIGIN).send(placement);
    await prisma.employeeIdentityBank.deleteMany({ where: { employeeId } });
    if (savedRow) {
      const { updatedAt: _ignored, ...row } = savedRow;
      await prisma.employeeIdentityBank.create({ data: row as never });
    }
    await app.close();
  });

  it('an employee reads their own details masked, without edit or reveal', async () => {
    const res = await as.employee.get(path()).expect(200);
    expect(res.body).toMatchObject({
      employeeCode: PERSONA.employee,
      template: 'UAE',
      currency: 'AED',
      passportNumber: '••••0087',
      canEdit: false,
      canReveal: false,
    });
    expect(res.body.accountNumber).toMatch(/^•+0001$/);
    expect(JSON.stringify(res.body)).not.toContain('AE220330000010000000001');
  });

  it.each(['employee', 'teamLead', 'officeAdmin', 'taManager', 'recruiter'] as const)(
    "%s cannot read someone else's details (404)",
    async (who) => {
      const other = who === 'employee' ? PERSONA.teamLead : PERSONA.employee;
      await as[who].get(path(other)).expect(404);
    },
  );

  it('HR reads them masked, with edit and reveal', async () => {
    const res = await as.hr.get(path()).expect(200);
    expect(res.body).toMatchObject({ passportNumber: '••••0087', canEdit: true, canReveal: true });
    expect(res.body.emiratesId).toMatch(/^•+87-1$/);
  });

  it.each(['employee', 'teamLead', 'officeAdmin', 'taManager', 'recruiter'] as const)(
    '%s cannot edit (403)',
    async (who) => {
      const res = await patch(who, { bankName: 'Other Bank' }).expect(403);
      expect(res.body.code).toBe('employee.identity_bank_edit_not_allowed');
    },
  );

  it.each(['employee', 'teamLead', 'officeAdmin'] as const)('%s cannot reveal a number (403)', async (who) => {
    const res = await reveal(who, 'passportNumber').expect(403);
    expect(res.body.code).toBe('employee.reveal_not_allowed');
  });

  it('HR reveals one number; the audit row names the field, never the value', async () => {
    const before = (await audits('employee.number_revealed')).total;
    const res = await reveal('hr', 'passportNumber').expect(200);
    expect(res.body).toEqual({ field: 'passportNumber', value: 'N1000087' });
    const log = await audits('employee.number_revealed');
    expect(log.total).toBe(before + 1);
    expect(log.items[0]!.after).toEqual({ revealed: 'Passport number' });
    expect(JSON.stringify(log.items[0])).not.toContain('N1000087');
    await reveal('hr', 'aadhaar').expect(404);
    await reveal('hr', 'salary').expect(400);
    await reveal('hr', 'passportNumber', 'GS-999').expect(404);
  });

  it('HR changes the IBAN: stored encrypted, returned masked, audited masked under Bank', async () => {
    const before = (await audits('employee.bank_updated')).total;
    const res = await patch('hr', {
      accountNumber: 'ae28 0330 0000 1000 0000 087',
      accountName: 'Dev Employee Account',
    }).expect(200);
    expect(res.body.accountNumber).toMatch(/^•+0087$/);
    const row = await prisma.employeeIdentityBank.findUniqueOrThrow({ where: { employeeId } });
    expect(row.accountNumberEnc).toMatch(/^v1\./);
    expect(row.accountNumberEnc).not.toContain(IBAN);
    expect((await reveal('hr', 'accountNumber').expect(200)).body.value).toBe(IBAN);

    const log = await audits('employee.bank_updated');
    expect(log.total).toBe(before + 1);
    expect(log.items[0]!.module).toBe('Bank');
    expect(log.items[0]!.after).toEqual({
      accountName: 'Dev Employee Account',
      accountNumber: expect.stringMatching(/^•+0087$/),
    });
    expect(JSON.stringify(log.items[0])).not.toContain(IBAN);

    // The same values again change nothing and write nothing.
    await patch('hr', { accountNumber: IBAN, accountName: 'Dev Employee Account' }).expect(200);
    expect((await audits('employee.bank_updated')).total).toBe(before + 1);
  });

  it('identity changes are audited under Employee, masked', async () => {
    const before = (await audits('employee.identity_updated')).total;
    await patch('hr', { emiratesId: '784-1990-0000099-2', visaExpiry: '2028-01-31' }).expect(200);
    const log = await audits('employee.identity_updated');
    expect(log.total).toBe(before + 1);
    expect(log.items[0]!.module).toBe('Employee');
    expect(log.items[0]!.after).toEqual({ emiratesId: expect.stringMatching(/^•+99-2$/), visaExpiry: '2028-01-31' });
  });

  it('BR-EMP-001/008/009 and validation', async () => {
    await patch('hr', { aadhaar: '123456789012' }).expect(400); // India only
    await patch('hr', { paymentMode: 'Cheque' }).expect(400); // India only
    await patch('hr', { accountNumber: 'AE230330000010000000001' }).expect(400); // bad checksum
    await patch('hr', { emiratesId: '784199000000992' }).expect(400);
    await patch('hr', { passportNumber: null }).expect(400); // required for UAE
    await patch('hr', { visaExpiry: '2028-02-30' }).expect(400);
    await patch('hr', { salary: 1000 }).expect(400); // unknown field
    await patch('hr', { employmentStatus: 'INACTIVE' }).expect(400);
  });

  it('BR-EMP-001: a move to India clears the UAE fields and the bank, keeps the passport', async () => {
    const gsit = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    const hr = await prisma.department.findFirstOrThrow({ where: { companyId: gsit.id, name: 'HR' } });
    const exec = await prisma.designation.findFirstOrThrow({ where: { departmentId: hr.id, title: 'HR Executive' } });
    await as.hr
      .patch(`/api/employees/${PERSONA.employee}/employment`)
      .set('Origin', ORIGIN)
      .send({ locationId: 'Kochi', companyId: gsit.id, departmentId: hr.id, designationId: exec.id })
      .expect(200);

    const res = await as.hr.get(path()).expect(200);
    expect(res.body).toMatchObject({
      template: 'INDIA',
      currency: 'INR',
      passportNumber: '••••0087',
      emiratesId: null,
      visaExpiry: null,
      accountNumber: null,
      paymentMode: null,
      bankName: null,
    });

    // India rules now apply.
    await patch('hr', { emiratesId: '784-1990-0000087-1' }).expect(400);
    await patch('hr', { pfEnrolled: 'Yes' }).expect(400); // needs UAN and its mobile
    const ok = await patch('hr', {
      aadhaar: '1234 5678 9012',
      pan: 'abcde1234f',
      pfEnrolled: 'Yes',
      uan: '100200300400',
      uanMobile: '+91 98765 43210',
      paymentMode: 'Bank Transfer',
      bankName: 'Example Bank',
      accountNumber: '123456789012',
      branchCode: 'exmp0001234',
    }).expect(200);
    expect(ok.body).toMatchObject({ aadhaar: '••••••••9012', pan: '••••••234F', branchCode: 'EXMP0001234' });
  });
});
