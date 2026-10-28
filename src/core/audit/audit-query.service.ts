import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors/app-error.js';
import { toCsv } from '../../shared/security/csv.js';
import type { AuthUser } from '../auth/auth-user.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuditFilterQuery, ListAuditQuery } from './api/audit-log.query.js';
import { AuditLogResponse, type AuditFiltersResponse, type AuditLogListResponse } from './api/audit-log.response.js';
import { actorOf, AuditService } from './audit.service.js';

/** One CSV is at most this many rows; a larger export must be narrowed with filters. */
export const EXPORT_MAX_ROWS = 10_000;

/* Read side of the append-only audit trail (Administration → Audit Logs). Writes stay in AuditService. */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAuditQuery): Promise<AuditLogListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = whereOf(query);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map(AuditLogResponse.from), total, page, pageSize };
  }

  /** Values for the filter dropdowns. */
  async filters(): Promise<AuditFiltersResponse> {
    const [modules, actions, actors] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ['module'], orderBy: { module: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      // Latest name per person: names can change over time.
      this.prisma.$queryRaw<{ id: string; label: string }[]>`
        SELECT DISTINCT ON (actor_id) actor_id::text AS id, actor_label AS label
        FROM audit_logs WHERE actor_id IS NOT NULL ORDER BY actor_id, at DESC`,
    ]);
    return {
      modules: modules.map((m) => m.module),
      actions: actions.map((a) => a.action),
      actors: actors.sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  /** CSV of the filtered log. The export itself is audited (module Security) — exports are watched for bulk access. */
  async exportCsv(query: AuditFilterQuery, user: AuthUser, ip?: string): Promise<string> {
    const where = whereOf(query);
    const total = await this.prisma.auditLog.count({ where });
    if (total > EXPORT_MAX_ROWS) {
      throw new AppError(
        'audit.export_too_large',
        `The export would have ${total} rows; narrow the filters to at most ${EXPORT_MAX_ROWS}`,
        400,
        { total, max: EXPORT_MAX_ROWS },
      );
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
    });
    await this.audit.record({
      actor: actorOf(user),
      module: 'Security',
      action: 'audit.exported',
      entityType: 'audit_log',
      after: { filters: { ...query }, rows: rows.length },
      ip,
    });
    return toCsv(
      ['Time', 'Module', 'Action', 'By', 'By (id)', 'Entity', 'Entity id', 'Before', 'After', 'IP'],
      rows.map((r) => [
        r.at,
        r.module,
        r.action,
        r.actorLabel,
        r.actorId,
        r.entityType,
        r.entityId,
        r.before === null ? '' : JSON.stringify(r.before),
        r.after === null ? '' : JSON.stringify(r.after),
        r.ip,
      ]),
    );
  }
}

function whereOf(f: AuditFilterQuery): Prisma.AuditLogWhereInput {
  const text = f.q?.trim();
  const contains = (s: string) => ({ contains: s, mode: 'insensitive' as const });
  return {
    module: f.module,
    action: f.action,
    actorId: f.actorId,
    entityType: f.entityType,
    entityId: f.entityId,
    at:
      f.from || f.to
        ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined }
        : undefined,
    OR: text
      ? [
          { actorLabel: contains(text) },
          { module: contains(text) },
          { action: contains(text) },
          { entityType: contains(text) },
          { entityId: contains(text) },
        ]
      : undefined,
  };
}
