import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PlacementFacts } from '../domain/employment.rules.js';
import { employeeInScope } from './employee-scope.where.js';
import { EMPLOYEE, type EmployeeRecord } from './employees.repository.js';

const CURRENT = {
  id: true,
  employeeCode: true,
  fullName: true,
  locationId: true,
  companyId: true,
  departmentId: true,
  designationId: true,
  reportingManagerId: true,
  employmentType: true,
  dateOfJoining: true,
  location: { select: { name: true, template: true } },
  company: { select: { name: true } },
  department: { select: { name: true } },
  designation: { select: { title: true } },
  reportingManager: { select: { employeeCode: true, fullName: true } },
  profile: { select: { seatingLocation: true } },
  emergencyContacts: { select: { id: true, group: true } },
  identityBank: { select: { employeeId: true } },
  _count: { select: { salaryComponents: true } },
} as const satisfies Prisma.EmployeeSelect;

export type EmploymentRecord = Prisma.EmployeeGetPayload<{ select: typeof CURRENT }>;

/** The facts the rules need, plus the display names the audit row uses. */
export type PlacementLookup = PlacementFacts & {
  names: {
    location?: string;
    template?: 'UAE' | 'INDIA';
    seating?: string[];
    company?: string;
    department?: string;
    designation?: string;
    manager?: string;
  };
};

export interface EmploymentWrite {
  data: Prisma.EmployeeUncheckedUpdateInput;
  /** Emergency contacts whose group changes with a location move (BR-EMP-001). */
  emergencyGroups: { id: string; group: string }[];
  /** undefined = leave the seating location alone; null = clear it. */
  seatingLocation?: null;
  /** Identity / bank columns a country move clears (BR-EMP-001), all set to null. */
  identityBankCleared?: Prisma.EmployeeIdentityBankUpdateManyMutationInput;
}

/** Upper bound when walking a reporting line; the company is ~200 people, so a longer chain means bad data. */
const MAX_CHAIN = 500;

@Injectable()
export class EmploymentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The employment record of an employee the caller may edit, or null (out of scope looks like not found). */
  findByCode(scope: EmployeeScope, employeeCode: string): Promise<EmploymentRecord | null> {
    return this.prisma.employee.findFirst({
      where: { AND: [employeeInScope(scope), { employeeCode }] },
      select: CURRENT,
    });
  }

  async lookup(ids: {
    locationId: string;
    companyId: string;
    departmentId: string | null;
    designationId: string | null;
    reportingManagerId: string | null;
  }): Promise<PlacementLookup> {
    const [location, company, department, designation, manager] = await Promise.all([
      this.prisma.location.findUnique({
        where: { id: ids.locationId },
        select: { id: true, name: true, template: true, seating: true },
      }),
      this.prisma.company.findUnique({
        where: { id: ids.companyId },
        select: { id: true, name: true, status: true, locationId: true },
      }),
      ids.departmentId
        ? this.prisma.department.findUnique({
            where: { id: ids.departmentId },
            select: { id: true, name: true, companyId: true, locations: { select: { locationId: true } } },
          })
        : null,
      ids.designationId
        ? this.prisma.designation.findUnique({
            where: { id: ids.designationId },
            select: { id: true, title: true, departmentId: true },
          })
        : null,
      ids.reportingManagerId
        ? this.prisma.employee.findUnique({
            where: { id: ids.reportingManagerId },
            select: { id: true, employeeCode: true, fullName: true, employmentStatus: true, reportingManagerId: true },
          })
        : null,
    ]);
    return {
      location: location && { id: location.id },
      company: company && { id: company.id, status: company.status, locationId: company.locationId },
      department: department && {
        id: department.id,
        companyId: department.companyId,
        locationIds: department.locations.map((l) => l.locationId),
      },
      designation: designation && { id: designation.id, departmentId: designation.departmentId },
      manager: manager && {
        id: manager.id,
        status: manager.employmentStatus,
        chain: await this.chainAbove(manager.reportingManagerId),
      },
      names: {
        location: location?.name,
        template: location?.template,
        seating: location?.seating,
        company: company?.name,
        department: department?.name,
        designation: designation?.title,
        manager: manager ? `${manager.fullName} (${manager.employeeCode})` : undefined,
      },
    };
  }

  /** Ids up the reporting line starting at `id` (nearest first). Stops at the top, at a loop, or at MAX_CHAIN. */
  private async chainAbove(id: string | null): Promise<string[]> {
    const out: string[] = [];
    for (let next = id; next && out.length < MAX_CHAIN && !out.includes(next);) {
      out.push(next);
      const row = await this.prisma.employee.findUnique({ where: { id: next }, select: { reportingManagerId: true } });
      next = row?.reportingManagerId ?? null;
    }
    return out;
  }

  /** Applies the change and its location side effects with one audit row, in one transaction. */
  save(
    employeeId: string,
    w: EmploymentWrite,
    change: { before: Prisma.InputJsonObject; after: Prisma.InputJsonObject },
    actor: AuditActor,
  ): Promise<EmployeeRecord> {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.employee.update({ where: { id: employeeId }, data: w.data, select: EMPLOYEE });
      for (const c of w.emergencyGroups) {
        await tx.emergencyContact.update({ where: { id: c.id }, data: { group: c.group } });
      }
      if (w.seatingLocation === null) {
        await tx.employeeProfile.updateMany({ where: { employeeId }, data: { seatingLocation: null } });
      }
      if (w.identityBankCleared) {
        await tx.employeeIdentityBank.updateMany({ where: { employeeId }, data: w.identityBankCleared });
      }
      await this.audit.record(
        {
          actor,
          module: 'Employee',
          action: 'employee.employment_updated',
          entityType: 'employee',
          entityId: employeeId,
          before: change.before,
          after: change.after,
        },
        tx,
      );
      return saved;
    });
  }
}
