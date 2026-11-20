import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { employeeInScope } from './employee-scope.where.js';

const IDENTITY_BANK = {
  id: true,
  employeeCode: true,
  reportingManagerId: true,
  location: { select: { template: true } },
  identityBank: true,
} as const satisfies Prisma.EmployeeSelect;

export type IdentityBankRecord = Prisma.EmployeeGetPayload<{ select: typeof IDENTITY_BANK }>;
/** Columns a save may set (null clears). Encrypted columns receive FieldCipher output only. */
export type IdentityBankData = Omit<Prisma.EmployeeIdentityBankUncheckedCreateInput, 'employeeId' | 'updatedAt'>;

/** One audit row per area that changed: identity / PF (module Employee) and bank (module Bank), masked values. */
export interface IdentityBankAudit {
  module: 'Employee' | 'Bank';
  action: 'employee.identity_updated' | 'employee.bank_updated';
  before: Prisma.InputJsonObject;
  after: Prisma.InputJsonObject;
}

@Injectable()
export class IdentityBankRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The record of an employee in `scope`, or null: out of scope looks the same as not found. */
  findByCode(scope: EmployeeScope, employeeCode: string): Promise<IdentityBankRecord | null> {
    return this.prisma.employee.findFirst({
      where: { AND: [employeeInScope(scope), { employeeCode }] },
      select: IDENTITY_BANK,
    });
  }

  /** Saves the changed columns with their audit rows, in one transaction. */
  save(employeeId: string, data: IdentityBankData, audits: IdentityBankAudit[], actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.employeeIdentityBank.upsert({ where: { employeeId }, create: { employeeId, ...data }, update: data });
      for (const a of audits) {
        await this.audit.record(
          {
            actor,
            module: a.module,
            action: a.action,
            entityType: 'employee',
            entityId: employeeId,
            before: a.before,
            after: a.after,
          },
          tx,
        );
      }
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: IDENTITY_BANK });
    });
  }

  /** Records that a full number was shown: which field only, never the value. */
  recordReveal(employeeId: string, label: string, actor: AuditActor) {
    return this.audit.record({
      actor,
      module: 'Employee',
      action: 'employee.number_revealed',
      entityType: 'employee',
      entityId: employeeId,
      after: { revealed: label },
    });
  }
}
