import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { DesignationUsage } from '../domain/department.rules.js';

const DESIGNATION = { id: true, departmentId: true, title: true, updatedAt: true } as const;

export type DesignationRecord = NonNullable<Awaited<ReturnType<DesignationsRepository['findById']>>>;

/* Designations (job titles) of a department. Writes run in a transaction with their audit row. */
@Injectable()
export class DesignationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(filter: { departmentId?: string }) {
    return this.prisma.designation.findMany({
      where: { departmentId: filter.departmentId },
      select: DESIGNATION,
      orderBy: { title: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.designation.findUnique({ where: { id }, select: DESIGNATION });
  }

  departmentExists(id: string) {
    return this.prisma.department.count({ where: { id } }).then((n) => n > 0);
  }

  /** BR-ORG-015: titles are unique within a department, ignoring case. */
  titleTaken(departmentId: string, title: string, exceptId?: string) {
    return this.prisma.designation
      .count({
        where: {
          departmentId,
          title: { equals: title, mode: 'insensitive' },
          id: exceptId ? { not: exceptId } : undefined,
        },
      })
      .then((n) => n > 0);
  }

  create(data: { departmentId: string; title: string }, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const designation = await tx.designation.create({ data, select: DESIGNATION });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'designation.created',
          entityType: 'designation',
          entityId: designation.id,
          after: { ...data },
        },
        tx,
      );
      return designation;
    });
  }

  rename(id: string, before: string, title: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const designation = await tx.designation.update({ where: { id }, data: { title }, select: DESIGNATION });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'designation.updated',
          entityType: 'designation',
          entityId: id,
          before: { title: before },
          after: { title },
        },
        tx,
      );
      return designation;
    });
  }

  /* References use ON DELETE SET NULL, so the database would not stop a delete. The row is locked first so the
     usage counted here cannot change before the delete (see DepartmentsRepository.delete). */
  delete(id: string, before: DesignationRecord, actor: AuditActor, assertDeletable: (u: DesignationUsage) => void) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM designations WHERE id = ${id}::uuid FOR UPDATE`;
      // One at a time: a transaction has a single connection.
      assertDeletable({
        employees: await tx.employee.count({ where: { designationId: id } }),
        requisitions: await tx.requisition.count({ where: { designationId: id } }),
        jobs: await tx.job.count({ where: { designationId: id } }),
      });

      await tx.designation.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'designation.deleted',
          entityType: 'designation',
          entityId: id,
          before: { departmentId: before.departmentId, title: before.title },
        },
        tx,
      );
    });
  }
}
