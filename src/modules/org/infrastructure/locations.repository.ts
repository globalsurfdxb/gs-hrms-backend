import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { LocationTemplate } from '../../../generated/prisma/client.js';
import type { LocationUsage } from '../domain/location.rules.js';

export interface LocationData {
  name: string;
  city: string;
  currency: string;
  timezone: string;
  phoneCode: string;
  phoneDigits: number;
  phoneExample: string | null;
  workingHours: string;
  seating: string[];
  template: LocationTemplate;
}

const LOCATION = {
  id: true,
  name: true,
  city: true,
  currency: true,
  timezone: true,
  phoneCode: true,
  phoneDigits: true,
  phoneExample: true,
  workingHours: true,
  seating: true,
  template: true,
  system: true,
  updatedAt: true,
} as const;

export type LocationRecord = NonNullable<Awaited<ReturnType<LocationsRepository['findById']>>>;

/* Locations are the org module's only readable-key table. Writes run in a transaction with their audit row. */
@Injectable()
export class LocationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.location.findMany({ select: LOCATION, orderBy: [{ system: 'desc' }, { name: 'asc' }] });
  }

  findById(id: string) {
    return this.prisma.location.findUnique({ where: { id }, select: LOCATION });
  }

  /** BR-ORG-007: names are unique ignoring case. */
  nameTaken(name: string, exceptId?: string) {
    return this.prisma.location
      .count({ where: { name: { equals: name, mode: 'insensitive' }, id: exceptId ? { not: exceptId } : undefined } })
      .then((n) => n > 0);
  }

  /** Ids that start with `prefix` (ignoring case), so a new id can be made unique. */
  idsStartingWith(prefix: string) {
    return this.prisma.location
      .findMany({ where: { id: { startsWith: prefix, mode: 'insensitive' } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  }

  /** Everything that references the location (each is a RESTRICT foreign key). */
  async usage(id: string): Promise<LocationUsage> {
    const [companies, departments, employees, requisitions, candidates] = await Promise.all([
      this.prisma.company.count({ where: { locationId: id } }),
      this.prisma.departmentLocation.count({ where: { locationId: id } }),
      this.prisma.employee.count({ where: { locationId: id } }),
      this.prisma.requisition.count({ where: { locationId: id } }),
      this.prisma.candidate.count({ where: { locationId: id } }),
    ]);
    return { companies, departments, employees, requisitions, candidates };
  }

  create(id: string, data: LocationData, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.create({ data: { id, ...data, system: false }, select: LOCATION });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'location.created',
          entityType: 'location',
          entityId: id,
          after: { ...data },
        },
        tx,
      );
      return location;
    });
  }

  update(id: string, before: LocationData, changes: Partial<LocationData>, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.update({ where: { id }, data: changes, select: LOCATION });
      const changed = Object.keys(changes) as (keyof LocationData)[];
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'location.updated',
          entityType: 'location',
          entityId: id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, changes[k] ?? null])),
        },
        tx,
      );
      return location;
    });
  }

  /** A reference added after the usage check still fails the RESTRICT foreign key (→ 409 record.in_use). */
  delete(id: string, before: LocationData, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.location.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          module: 'Organization',
          action: 'location.deleted',
          entityType: 'location',
          entityId: id,
          before: { ...before },
        },
        tx,
      );
    });
  }
}
