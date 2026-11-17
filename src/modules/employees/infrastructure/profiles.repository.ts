import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { employeeInScope } from './employee-scope.where.js';

const byPosition = { orderBy: { position: 'asc' } } as const;

const PROFILE = {
  id: true,
  employeeCode: true,
  location: { select: { template: true, timezone: true } },
  profile: true,
  emergencyContacts: byPosition,
  experience: byPosition,
  education: byPosition,
  family: byPosition,
} as const satisfies Prisma.EmployeeSelect;

export type ProfileRecord = Prisma.EmployeeGetPayload<{ select: typeof PROFILE }>;

/** Columns of employee_profiles a save may set (null clears). */
export type ProfileData = Omit<Prisma.EmployeeProfileUncheckedCreateInput, 'employeeId' | 'updatedAt'>;

type Row<T> = Omit<T, 'employeeId' | 'position' | 'id'>;
export interface ProfileLists {
  emergencyContacts?: Row<Prisma.EmergencyContactUncheckedCreateInput>[];
  experience?: Row<Prisma.WorkExperienceUncheckedCreateInput>[];
  education?: Row<Prisma.EducationUncheckedCreateInput>[];
  family?: Row<Prisma.FamilyMemberUncheckedCreateInput>[];
}

export interface ProfileAudit {
  before: Prisma.InputJsonObject;
  after: Prisma.InputJsonObject;
}

const numbered = <T>(rows: T[], employeeId: string) => rows.map((r, position) => ({ ...r, employeeId, position }));

@Injectable()
export class ProfilesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The profile of an employee the caller may see, or null: out of scope looks the same as not found. */
  findByCode(scope: EmployeeScope, employeeCode: string): Promise<ProfileRecord | null> {
    return this.prisma.employee.findFirst({
      where: { AND: [employeeInScope(scope), { employeeCode }] },
      select: PROFILE,
    });
  }

  /** Saves the changed fields and replaces the lists that were sent, with one audit row, in one transaction. */
  save(employeeId: string, data: ProfileData, lists: ProfileLists, change: ProfileAudit, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.employeeProfile.upsert({ where: { employeeId }, create: { employeeId, ...data }, update: data });
      }
      if (lists.emergencyContacts) {
        await tx.emergencyContact.deleteMany({ where: { employeeId } });
        await tx.emergencyContact.createMany({ data: numbered(lists.emergencyContacts, employeeId) });
      }
      if (lists.experience) {
        await tx.workExperience.deleteMany({ where: { employeeId } });
        await tx.workExperience.createMany({ data: numbered(lists.experience, employeeId) });
      }
      if (lists.education) {
        await tx.education.deleteMany({ where: { employeeId } });
        await tx.education.createMany({ data: numbered(lists.education, employeeId) });
      }
      if (lists.family) {
        await tx.familyMember.deleteMany({ where: { employeeId } });
        await tx.familyMember.createMany({ data: numbered(lists.family, employeeId) });
      }
      await this.audit.record(
        {
          actor,
          module: 'Employee',
          action: 'employee.profile_updated',
          entityType: 'employee',
          entityId: employeeId,
          before: change.before,
          after: change.after,
        },
        tx,
      );
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: PROFILE });
    });
  }
}
