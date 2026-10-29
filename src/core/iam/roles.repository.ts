import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';

const ROLE = {
  id: true,
  name: true,
  description: true,
  system: true,
  updatedAt: true,
  permissions: { select: { key: true }, orderBy: { key: 'asc' } },
  _count: { select: { employees: true } },
} as const;

export type RoleRecord = NonNullable<Awaited<ReturnType<RolesRepository['findById']>>>;
export const keysOf = (r: { permissions: { key: string }[] }) => r.permissions.map((p) => p.key);

/* Roles, their grants and role assignment. Every change runs in one transaction with its audit row (module Access)
   and revokes the sessions it affects, so nobody keeps working with a stale grant set in an open browser tab. */
@Injectable()
export class RolesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.role.findMany({ select: ROLE, orderBy: [{ system: 'desc' }, { name: 'asc' }] });
  }

  findById(id: string) {
    return this.prisma.role.findUnique({ where: { id }, select: ROLE });
  }

  /** Role names are unique ignoring case (the column is unique as typed). */
  nameTaken(name: string, exceptId?: string) {
    return this.prisma.role
      .count({ where: { name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined } })
      .then((n) => n > 0);
  }

  employee(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        role: { select: { id: true, name: true, permissions: { select: { key: true } } } },
      },
    });
  }

  create(data: { name: string; description: string; permissions: string[] }, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: data.name,
          description: data.description,
          permissions: { create: data.permissions.map((key) => ({ key })) },
        },
        select: ROLE,
      });
      await this.audit.record(
        { actor, module: 'Access', action: 'role.created', entityType: 'role', entityId: role.id, after: { ...data } },
        tx,
      );
      return role;
    });
  }

  updateDetails(
    id: string,
    before: { name: string; description: string },
    changes: { name?: string; description?: string },
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({ where: { id }, data: changes, select: ROLE });
      const changed = Object.keys(changes) as (keyof typeof changes)[];
      await this.audit.record(
        {
          actor,
          module: 'Access',
          action: 'role.updated',
          entityType: 'role',
          entityId: id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, changes[k] ?? null])),
        },
        tx,
      );
      return role;
    });
  }

  /* Replaces the grants. The role row is locked and the current grants are read inside the transaction, so the
     check (anti-escalation) and the audit diff always see what is actually replaced. */
  setPermissions(
    id: string,
    next: string[],
    actor: AuditActor,
    check: (before: string[]) => { granted: string[]; revoked: string[] },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
      const before = (await tx.rolePermission.findMany({ where: { roleId: id }, select: { key: true } })).map(
        (p) => p.key,
      );
      const { granted, revoked } = check(before);
      if (granted.length === 0 && revoked.length === 0) return { sessionsRevoked: 0 };

      await tx.rolePermission.deleteMany({ where: { roleId: id, key: { in: revoked } } });
      await tx.rolePermission.createMany({ data: granted.map((key) => ({ roleId: id, key })) });
      const sessions = await tx.session.updateMany({
        where: { revokedAt: null, employee: { roleId: id } },
        data: { revokedAt: new Date() },
      });
      await tx.role.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.audit.record(
        {
          actor,
          module: 'Access',
          action: 'role.permissions_changed',
          entityType: 'role',
          entityId: id,
          after: { granted, revoked, sessionsRevoked: sessions.count },
        },
        tx,
      );
      return { sessionsRevoked: sessions.count };
    });
  }

  /** The role row is locked so nobody gets the role between the member count and the delete. */
  delete(
    id: string,
    before: { name: string; permissions: string[] },
    actor: AuditActor,
    check: (members: number) => void,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
      check(await tx.employee.count({ where: { roleId: id } }));
      await tx.role.delete({ where: { id } });
      await this.audit.record(
        { actor, module: 'Access', action: 'role.deleted', entityType: 'role', entityId: id, before: { ...before } },
        tx,
      );
    });
  }

  /** Gives an employee another role and ends their sessions, so their next request uses the new grants. */
  assignRole(
    employeeId: string,
    from: { id: string; name: string },
    to: { id: string; name: string },
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Locked against a concurrent change of the same person's role (both would pass the checks on stale data).
      const [current] = await tx.$queryRaw<{ role_id: string }[]>`
        SELECT role_id FROM employees WHERE id = ${employeeId}::uuid FOR UPDATE`;
      if (current?.role_id !== from.id) return { changed: false, sessionsRevoked: 0 };

      await tx.employee.update({ where: { id: employeeId }, data: { roleId: to.id } });
      const sessions = await tx.session.updateMany({
        where: { employeeId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          module: 'Access',
          action: 'employee.role_changed',
          entityType: 'employee',
          entityId: employeeId,
          before: { role: from.name },
          after: { role: to.name, sessionsRevoked: sessions.count },
        },
        tx,
      );
      return { changed: true, sessionsRevoked: sessions.count };
    });
  }
}
