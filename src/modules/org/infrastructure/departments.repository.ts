import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { DepartmentUsage } from '../domain/department.rules.js';

export interface DepartmentData {
  companyId: string;
  name: string;
  locationIds: string[];
  headEmployeeId: string | null;
}

const DEPARTMENT = {
  id: true,
  companyId: true,
  name: true,
  headEmployeeId: true,
  updatedAt: true,
  locations: { select: { locationId: true } },
  head: { select: { id: true, employeeCode: true, fullName: true } },
  designations: { select: { id: true, title: true }, orderBy: { title: 'asc' } },
} as const;

export type DepartmentRecord = NonNullable<Awaited<ReturnType<DepartmentsRepository['findById']>>>;

/* Departments and their locations. Writes run in a transaction with their audit row. */
@Injectable()
export class DepartmentsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filter: { companyId?: string; locationId?: string }) {
    return this.prisma.department.findMany({
      where: {
        companyId: filter.companyId,
        locations: filter.locationId ? { some: { locationId: filter.locationId } } : undefined,
      },
      select: DEPARTMENT,
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.department.findUnique({ where: { id }, select: DEPARTMENT });
  }

  company(id: string) {
    return this.prisma.company.findUnique({ where: { id }, select: { id: true, locationId: true } });
  }

  locationIds() {
    return this.prisma.location.findMany({ select: { id: true } }).then((rows) => rows.map((r) => r.id));
  }

  employee(id: string) {
    return this.prisma.employee.findUnique({ where: { id }, select: { companyId: true, employmentStatus: true } });
  }

  /** BR-ORG-012: names are unique within a company, ignoring case. */
  nameTaken(companyId: string, name: string, exceptId?: string) {
    return this.prisma.department
      .count({
        where: {
          companyId,
          name: { equals: name, mode: 'insensitive' },
          id: exceptId ? { not: exceptId } : undefined,
        },
      })
      .then((n) => n > 0);
  }

  /** Current (not INACTIVE) employees of the department, per location, for the given locations. */
  async staffByLocation(departmentId: string, locationIds: string[]): Promise<Record<string, number>> {
    const rows = await this.prisma.employee.groupBy({
      by: ['locationId'],
      where: { departmentId, locationId: { in: locationIds }, employmentStatus: { not: 'INACTIVE' } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.locationId, r._count._all]));
  }

  create(data: DepartmentData, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          companyId: data.companyId,
          name: data.name,
          headEmployeeId: data.headEmployeeId,
          locations: { create: data.locationIds.map((locationId) => ({ locationId })) },
        },
        select: DEPARTMENT,
      });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'department.created',
          entityType: 'department',
          entityId: department.id,
          after: { ...data },
        },
        tx,
      );
      return department;
    });
  }

  update(id: string, before: DepartmentData, changes: Partial<Omit<DepartmentData, 'companyId'>>, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      if (changes.locationIds) {
        await tx.departmentLocation.deleteMany({ where: { departmentId: id } });
        await tx.departmentLocation.createMany({
          data: changes.locationIds.map((locationId) => ({ departmentId: id, locationId })),
        });
      }
      const department = await tx.department.update({
        where: { id },
        data: { name: changes.name, headEmployeeId: changes.headEmployeeId },
        select: DEPARTMENT,
      });
      const changed = Object.keys(changes) as (keyof typeof changes)[];
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'department.updated',
          entityType: 'department',
          entityId: id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, changes[k] ?? null])),
        },
        tx,
      );
      return department;
    });
  }

  /* Employees and hiring records point at departments and designations with ON DELETE SET NULL / CASCADE, so the
     database would not stop a delete. The rows are locked first: a concurrent insert or update that references
     them waits (its foreign-key check needs a KEY SHARE lock), so the usage counted here cannot go stale. */
  delete(id: string, before: DepartmentData, actor: AuditActor, assertDeletable: (usage: DepartmentUsage) => void) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM departments WHERE id = ${id}::uuid FOR UPDATE`;
      const designations = await tx.$queryRaw<{ title: string }[]>`
        SELECT title FROM designations WHERE department_id = ${id}::uuid ORDER BY title FOR UPDATE`;
      // One at a time: a transaction has a single connection.
      const ofDesignations = { designation: { departmentId: id } };
      assertDeletable({
        employees: await tx.employee.count({ where: { departmentId: id } }),
        requisitions: await tx.requisition.count({ where: { departmentId: id } }),
        designationEmployees: await tx.employee.count({ where: ofDesignations }),
        designationRequisitions: await tx.requisition.count({ where: ofDesignations }),
        designationJobs: await tx.job.count({ where: ofDesignations }),
      });

      // Locations and designations go with the department (ON DELETE CASCADE).
      await tx.department.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'department.deleted',
          entityType: 'department',
          entityId: id,
          before: { ...before, designations: designations.map((d) => d.title) },
        },
        tx,
      );
    });
  }
}
