import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { CompanyStatus } from '../../../generated/prisma/client.js';

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
}
