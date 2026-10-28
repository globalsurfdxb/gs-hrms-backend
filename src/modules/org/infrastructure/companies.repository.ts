import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { CompanyStatus } from '../../../generated/prisma/client.js';
import type { CompanyUsage } from '../domain/company.rules.js';

export interface CompanyData {
  name: string;
  shortCode: string;
  description: string;
  website: string;
  locationId: string | null;
  established: string | null;
  status: CompanyStatus;
}

const COMPANY = {
  id: true,
  name: true,
  shortCode: true,
  description: true,
  website: true,
  locationId: true,
  established: true,
  status: true,
  updatedAt: true,
} as const;

export type CompanyRecord = NonNullable<Awaited<ReturnType<CompaniesRepository['findById']>>>;

/* The only place the org module touches Prisma. Writes run in a transaction together with their audit row. */
@Injectable()
export class CompaniesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.company.findMany({ select: COMPANY, orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.company.findUnique({ where: { id }, select: COMPANY });
  }

  locationExists(id: string) {
    return this.prisma.location.count({ where: { id } }).then((n) => n > 0);
  }

  create(data: CompanyData, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data, select: COMPANY });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'company.created',
          entityType: 'company',
          entityId: company.id,
          after: { ...data },
        },
        tx,
      );
      return company;
    });
  }

  update(id: string, before: CompanyData, changes: Partial<CompanyData>, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({ where: { id }, data: changes, select: COMPANY });
      const changed = Object.keys(changes) as (keyof CompanyData)[];
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'company.updated',
          entityType: 'company',
          entityId: id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, changes[k] ?? null])),
        },
        tx,
      );
      return company;
    });
  }

  /* The company, its departments and their designations are locked first: a concurrent insert or update that
     references them waits (its foreign-key check needs a KEY SHARE lock), so the usage counted here cannot go
     stale. Designations are referenced with ON DELETE SET NULL, so the database alone would not stop the delete. */
  delete(id: string, before: CompanyData, actor: AuditActor, assertDeletable: (usage: CompanyUsage) => void) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${id}::uuid FOR UPDATE`;
      const departments = await tx.$queryRaw<{ name: string }[]>`
        SELECT name FROM departments WHERE company_id = ${id}::uuid ORDER BY name FOR UPDATE`;
      await tx.$queryRaw`
        SELECT d.id FROM designations d JOIN departments p ON p.id = d.department_id
        WHERE p.company_id = ${id}::uuid FOR UPDATE OF d`;

      // One at a time: a transaction has a single connection.
      const inCompany = { department: { companyId: id } };
      const ofDesignations = { designation: inCompany };
      assertDeletable({
        employees: await tx.employee.count({ where: { OR: [{ companyId: id }, inCompany, ofDesignations] } }),
        requisitions: await tx.requisition.count({ where: { OR: [{ companyId: id }, inCompany, ofDesignations] } }),
        jobs: await tx.job.count({ where: { OR: [{ requisition: { companyId: id } }, ofDesignations] } }),
      });

      // Designations and department locations go with their departments (ON DELETE CASCADE).
      await tx.department.deleteMany({ where: { companyId: id } });
      await tx.company.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'company.deleted',
          entityType: 'company',
          entityId: id,
          before: {
            name: before.name,
            shortCode: before.shortCode,
            locationId: before.locationId,
            status: before.status,
            departments: departments.map((d) => d.name),
          },
        },
        tx,
      );
    });
  }
}
