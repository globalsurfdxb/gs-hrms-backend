import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { createTestApp, ORIGIN, PERSONA, signInAs } from '../app.js';

type Who = keyof typeof PERSONA;
interface Role {
  id: string;
  name: string;
  system: boolean;
  permissions: string[];
  memberCount: number;
}

const COMPANIES = 'administration:admin-companies';
const JOBS = 'hiring:recruiting:jobs';

/* Roles & Permissions. These endpoints change shared state (grants, roles, sessions), so the test only changes roles
   and an employee it creates itself — never the seeded roles or personas other test files rely on. */
describe('Roles & permissions API', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  // One sign-in per persona for the whole file: dev login is rate-limited to 10 a minute.
  const as = {} as Record<Who, Awaited<ReturnType<typeof signInAs>>>;
  const tag = randomBytes(3).toString('hex');
  const name = (base: string) => `${base} ${tag}`;
  let roleOf: Record<string, Role>;
  let tester: { id: string; code: string };

  const send = (who: Who, method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object) =>
    as[who][method](`/api/iam${path}`).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    for (const who of Object.keys(PERSONA) as Who[]) as[who] = await signInAs(app, PERSONA[who]);
    const roles = (await as.superAdmin.get('/api/iam/roles').expect(200)).body as Role[];
    roleOf = Object.fromEntries(roles.map((r) => [r.name, r]));

    // A throwaway employee (role Employee) whose role and sessions the test may change.
    const company = await prisma.company.findUniqueOrThrow({ where: { shortCode: 'GSIT' } });
    // Dev login takes GS-<digits>; a random 7-digit number never clashes with seeded or real codes.
    const code = `GS-9${randomInt(100_000, 1_000_000)}`;
    const e = await prisma.employee.create({
      data: {
        employeeCode: code,
        email: `rt-${tag}@hrms.local`,
        fullName: `Role Tester ${tag}`,
        locationId: 'Dubai',
        companyId: company.id,
        roleId: roleOf.Employee.id,
        employmentStatus: 'ACTIVE',
        employmentType: 'PERMANENT',
        dateOfJoining: new Date('2024-01-01'),
      },
    });
    tester = { id: e.id, code };
  });
  afterAll(async () => {
    await prisma.employee.delete({ where: { id: tester.id } });
    await app.close();
  });

  it('serves the permission catalogue', async () => {
    const res = await as.superAdmin.get('/api/iam/catalog').expect(200);
    const features = res.body.flatMap((m: { categories: { features: { id: string }[] }[] }) =>
      m.categories.flatMap((c) => c.features),
    );
    expect(res.body).toHaveLength(7);
    expect(features).toHaveLength(112);
    expect(features).toContainEqual({ id: COMPANIES, label: 'Companies', actions: ['add', 'edit', 'delete'] });
  });

  it('lists the system roles with their grants and members', () => {
    expect(
      Object.values(roleOf)
        .filter((r) => r.system)
        .map((r) => r.name),
    ).toEqual(expect.arrayContaining(['Super Admin', 'HR', 'Office Admin', 'Team Lead', 'Employee']));
    expect(roleOf.HR.permissions).toContain(`${COMPANIES}#edit`);
    expect(roleOf.HR.memberCount).toBeGreaterThan(0);
  });

  it('creates, renames and re-grants a custom role, and audits each change', async () => {
    const created = await send('superAdmin', 'post', '/roles', {
      name: `  ${name('Payroll Clerk')} `,
      permissions: [COMPANIES, COMPANIES],
    }).expect(201);
    expect(created.body).toMatchObject({ name: name('Payroll Clerk'), system: false, permissions: [COMPANIES] });
    const id = created.body.id as string;

    await send('superAdmin', 'patch', `/roles/${id}`, { name: name('Payroll Officer'), description: 'Payroll' }).expect(
      200,
    );
    const set = await send('superAdmin', 'put', `/roles/${id}/permissions`, {
      permissions: [COMPANIES, `${COMPANIES}#edit`, JOBS],
    }).expect(200);
    expect(set.body).toMatchObject({ granted: [`${COMPANIES}#edit`, JOBS], revoked: [], sessionsRevoked: 0 });
    expect(set.body.role).toMatchObject({ name: name('Payroll Officer'), description: 'Payroll' });

    await send('superAdmin', 'delete', `/roles/${id}`).expect(204);
    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'role', entityId: id },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((a) => [a.module, a.action])).toEqual([
      ['Access', 'role.created'],
      ['Access', 'role.updated'],
      ['Access', 'role.permissions_changed'],
      ['Access', 'role.deleted'],
    ]);
  });

  it('validates names and permission keys', async () => {
    expect((await send('superAdmin', 'post', '/roles', { name: 'hr' }).expect(409)).body.code).toBe('role.name_taken');
    const bad = (permissions: string[]) => send('superAdmin', 'post', '/roles', { name: name('Bad'), permissions });
    expect((await bad(['nope:nothing']).expect(400)).body.code).toBe('role.unknown_permission');
    expect((await bad(['administration:admin-audit#edit']).expect(400)).body.code).toBe('role.unknown_permission');
    expect((await bad([`${COMPANIES}#delete`]).expect(400)).body.code).toBe('role.permission_without_view');
  });

  it('protects system roles and your own role (BR-IAM-003, 005, 007)', async () => {
    const code = async (r: ReturnType<typeof send>, status: number) => (await r.expect(status)).body.code;
    expect(await code(send('superAdmin', 'patch', `/roles/${roleOf.HR.id}`, { name: 'People' }), 409)).toBe(
      'role.system',
    );
    expect(await code(send('superAdmin', 'delete', `/roles/${roleOf.HR.id}`), 409)).toBe('role.system');
    expect(
      await code(send('superAdmin', 'put', `/roles/${roleOf['Super Admin'].id}/permissions`, { permissions: [] }), 403),
    ).toBe('role.own_role');
    expect(
      await code(
        send('officeAdmin', 'put', `/roles/${roleOf['Super Admin'].id}/permissions`, { permissions: [] }),
        409,
      ),
    ).toBe('role.super_admin_fixed');
    expect(await code(send('hr', 'put', `/roles/${roleOf.HR.id}/permissions`, { permissions: [] }), 403)).toBe(
      'role.own_role',
    );
    const me = (await as.superAdmin.get('/api/auth/me').expect(200)).body.employeeId as string;
    expect(await code(send('superAdmin', 'put', `/employees/${me}/role`, { roleId: roleOf.HR.id }), 403)).toBe(
      'role.own_role',
    );
  });

  it('never lets anyone hand out more than they hold (BR-IAM-004, 006)', async () => {
    // Office Admin has Roles → Add/Edit but no Jobs and nothing of Super Admin's.
    const grant = await send('officeAdmin', 'post', '/roles', { name: name('Recruiter'), permissions: [JOBS] }).expect(
      403,
    );
    expect(grant.body).toMatchObject({ code: 'role.grant_exceeds_own', details: { missing: [JOBS] } });

    const promote = await send('officeAdmin', 'put', `/employees/${tester.id}/role`, {
      roleId: roleOf['Super Admin'].id,
    }).expect(403);
    expect(promote.body.code).toBe('role.assign_exceeds_own');
  });

  it('ends the sessions a change affects, so it applies at once', async () => {
    const role = await send('superAdmin', 'post', '/roles', { name: name('Temp'), permissions: [COMPANIES] }).expect(
      201,
    );
    const assigned = await send('superAdmin', 'put', `/employees/${tester.id}/role`, { roleId: role.body.id }).expect(
      200,
    );
    expect(assigned.body).toMatchObject({ employeeId: tester.id, role: name('Temp') });

    // The tester signs in with the new role, then the role's grants change: their session ends.
    const testerAgent = await signInAs(app, tester.code);
    expect((await testerAgent.get('/api/auth/me').expect(200)).body.permissions).toEqual([COMPANIES]);
    const set = await send('superAdmin', 'put', `/roles/${role.body.id}/permissions`, { permissions: [] }).expect(200);
    expect(set.body).toMatchObject({ revoked: [COMPANIES], sessionsRevoked: 1 });
    await testerAgent.get('/api/auth/me').expect(401);

    // A role someone has cannot be deleted; once they have another, it can.
    expect((await send('superAdmin', 'delete', `/roles/${role.body.id}`).expect(409)).body.code).toBe('role.in_use');
    await send('superAdmin', 'put', `/employees/${tester.id}/role`, { roleId: roleOf.Employee.id }).expect(200);
    await send('superAdmin', 'delete', `/roles/${role.body.id}`).expect(204);
  });

  it('returns 404 for an unknown role or employee', async () => {
    await as.superAdmin.get(`/api/iam/roles/${randomUUID()}`).expect(404);
    await send('superAdmin', 'put', `/employees/${randomUUID()}/role`, { roleId: roleOf.Employee.id }).expect(404);
  });

  it.each(['employee', 'teamLead'] as const)('forbids %s from reading or changing roles', async (who) => {
    await as[who].get('/api/iam/roles').expect(403);
    await as[who].get('/api/iam/catalog').expect(403);
    await send(who, 'post', '/roles', { name: name('Nope') }).expect(403);
  });

  it('gives HR no Delete on roles by default', async () => {
    await send('hr', 'delete', `/roles/${roleOf.Employee.id}`).expect(403);
  });
});
