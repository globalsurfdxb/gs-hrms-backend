import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../database/prisma.service.js';

export interface AuditActor {
  id: string | null;
  label: string;
}

export const actorOf = (user: Pick<AuthUser, 'employeeId' | 'fullName'>): AuditActor => ({
  id: user.employeeId,
  label: user.fullName,
});
export const SYSTEM_ACTOR: AuditActor = { id: null, label: 'system' };

export interface AuditEntry {
  actor: AuditActor;
  /** Frontend audit module name: Organization, Security, Employee, Hiring, Leave & Attendance, ... */
  module: string;
  /** `<entity>.<verb>` — e.g. company.created, auth.sign_in */
  action: string;
  entityType: string;
  entityId?: string;
  /** Changed fields only. NEVER include decrypted sensitive values (passport, bank, salary) — mask them. */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
}

/* Append-only audit trail. Pass the transaction client (`tx`) when auditing a change, so the change and its audit
   row commit or roll back together. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: entry.actor.id,
        actorLabel: entry.actor.label,
        module: entry.module,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
      },
    });
  }
}
