import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type {
  HiringEmploymentType,
  Prisma,
  RequisitionReason,
  RequisitionStatus,
} from '../../../generated/prisma/client.js';
import { conflict } from '../../../shared/errors/app-error.js';
import type { Step, StepLabel } from '../domain/requisition.rules.js';

export interface RequisitionData {
  title: string;
  companyId: string;
  departmentId: string;
  designationId: string | null;
  locationId: string;
  positions: number;
  employmentType: HiringEmploymentType;
  reason: RequisitionReason;
  replacesEmployeeId: string | null;
  /** Decimal as a string, e.g. "9000.00". */
  budgetMin: string;
  budgetMax: string;
  currency: string;
  targetStart: Date;
  hiringManagerId: string;
  justification: string;
}

/** Which requisitions a caller may see. Applied in every query (CLAUDE.md rule 8). */
export interface RequisitionScope {
  /** Sees every requisition (those who run recruiting: HR, Super Admin). */
  all: boolean;
  employeeId: string;
  /** Steps the caller decides on other people's requisitions (BR-HIR-002). */
  decidableLabels: StepLabel[];
}

export interface RequisitionFilter {
  status?: RequisitionStatus;
  locationId?: string;
  /** Only requisitions whose pending step the caller can decide (approval inbox). */
  waitingOnMe?: boolean;
}

export const PERSON = { select: { id: true, employeeCode: true, fullName: true } } as const;

const REQUISITION = {
  id: true,
  code: true,
  title: true,
  company: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  positions: true,
  employmentType: true,
  reason: true,
  replaces: PERSON,
  budgetMin: true,
  budgetMax: true,
  currency: true,
  targetStart: true,
  hiringManager: PERSON,
  justification: true,
  status: true,
  createdBy: PERSON,
  createdAt: true,
  updatedAt: true,
  job: { select: { id: true, code: true, status: true } },
  steps: {
    select: {
      position: true,
      label: true,
      status: true,
      decidedById: true,
      decidedBy: PERSON,
      decidedAt: true,
      note: true,
    },
    orderBy: { position: 'asc' },
  },
} as const satisfies Prisma.RequisitionSelect;

export type RequisitionRecord = Prisma.RequisitionGetPayload<{ select: typeof REQUISITION }>;

const AUDIT = { module: 'Hiring', entityType: 'requisition' } as const;

/* The only place the hiring module touches Prisma for requisitions. Writes run in a transaction with their audit
   row, and only apply when the row is unchanged since it was read (two approvers deciding at once → 409). */
@Injectable()
export class RequisitionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(scope: RequisitionScope, filter: RequisitionFilter, page: number, pageSize: number) {
    const where: Prisma.RequisitionWhereInput = {
      AND: [
        this.visible(scope),
        filter.status ? { status: filter.status } : {},
        filter.locationId ? { locationId: filter.locationId } : {},
        filter.waitingOnMe ? this.waitingOn(scope) : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.requisition.findMany({
        where,
        select: REQUISITION,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return { items, total };
  }

  findVisible(id: string, scope: RequisitionScope) {
    return this.prisma.requisition.findFirst({ where: { AND: [{ id }, this.visible(scope)] }, select: REQUISITION });
  }

  /* ---------------------------------------------------------------- reference checks (read-only, org/employees) */
  // The org module has no departments/designations service and the employees module does not exist yet, so the
  // references a requisition points to are checked here. Switch to their public services when they exist.

  location(id: string) {
    return this.prisma.location.findUnique({ where: { id }, select: { id: true, timezone: true, currency: true } });
  }

  company(id: string) {
    return this.prisma.company.findUnique({ where: { id }, select: { id: true, status: true } });
  }

  department(id: string) {
    return this.prisma.department.findUnique({ where: { id }, select: { id: true, companyId: true } });
  }

  designation(id: string) {
    return this.prisma.designation.findUnique({ where: { id }, select: { id: true, departmentId: true } });
  }

  employee(id: string) {
    return this.prisma.employee.findUnique({ where: { id }, select: { id: true, employmentStatus: true } });
  }

  /** A hiring manager candidate with the permission keys of their role (BR-HIR-003: they must be able to decide). */
  hiringManager(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      select: { id: true, employmentStatus: true, role: { select: { permissions: { select: { key: true } } } } },
    });
  }

  /* ---------------------------------------------------------------- writes */

  create(data: RequisitionData, chain: { status: RequisitionStatus; steps: Step[] } | null, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { id, code } = await tx.requisition.create({
        data: { ...data, createdById: actor.id!, status: chain?.status ?? 'DRAFT' },
        select: { id: true, code: true },
      });
      await this.audit.record(
        { ...AUDIT, actor, action: 'requisition.created', entityId: id, after: { code, ...auditable(data) } },
        tx,
      );
      if (chain) {
        await this.writeSteps(tx, id, chain.steps);
        await this.audit.record(
          { ...AUDIT, actor, action: 'requisition.submitted', entityId: id, after: chainSummary(chain) },
          tx,
        );
      }
      return tx.requisition.findUniqueOrThrow({ where: { id }, select: REQUISITION });
    });
  }

  update(before: RequisitionRecord, current: RequisitionData, changes: Partial<RequisitionData>, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.guardedUpdate(tx, before, changes);
      const changed = Object.keys(changes) as (keyof RequisitionData)[];
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'requisition.updated',
          entityId: before.id,
          before: pick(auditable(current), changed),
          after: pick(auditable({ ...current, ...changes }), changed),
        },
        tx,
      );
      return tx.requisition.findUniqueOrThrow({ where: { id: before.id }, select: REQUISITION });
    });
  }

  /** Submit, resubmit or decide: replaces the chain and sets the status. */
  saveChain(
    before: RequisitionRecord,
    chain: { status: RequisitionStatus; steps: Step[] },
    action: string,
    after: Prisma.InputJsonObject,
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.guardedUpdate(tx, before, { status: chain.status });
      await tx.requisitionStep.deleteMany({ where: { requisitionId: before.id } });
      await this.writeSteps(tx, before.id, chain.steps);
      await this.audit.record(
        { ...AUDIT, actor, action, entityId: before.id, before: { status: before.status }, after },
        tx,
      );
      return tx.requisition.findUniqueOrThrow({ where: { id: before.id }, select: REQUISITION });
    });
  }

  setStatus(before: RequisitionRecord, status: RequisitionStatus, action: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.guardedUpdate(tx, before, { status });
      await this.audit.record(
        { ...AUDIT, actor, action, entityId: before.id, before: { status: before.status }, after: { status } },
        tx,
      );
      return tx.requisition.findUniqueOrThrow({ where: { id: before.id }, select: REQUISITION });
    });
  }

  /* ---------------------------------------------------------------- helpers */

  private visible(scope: RequisitionScope): Prisma.RequisitionWhereInput {
    if (scope.all) return {};
    const me = scope.employeeId;
    return {
      OR: [
        { hiringManagerId: me },
        { createdById: me },
        // Approvers see what waits on their step, and what they already decided.
        ...(scope.decidableLabels.length
          ? [
              {
                status: 'PENDING_APPROVAL' as const,
                steps: { some: { status: 'PENDING' as const, label: { in: scope.decidableLabels } } },
              },
            ]
          : []),
        { steps: { some: { decidedById: me } } },
      ],
    };
  }

  private waitingOn(scope: RequisitionScope): Prisma.RequisitionWhereInput {
    return {
      status: 'PENDING_APPROVAL',
      OR: [
        { hiringManagerId: scope.employeeId, steps: { some: { status: 'PENDING', label: 'HIRING_MANAGER' } } },
        ...(scope.decidableLabels.length
          ? [{ steps: { some: { status: 'PENDING' as const, label: { in: scope.decidableLabels } } } }]
          : []),
      ],
    };
  }

  private async guardedUpdate(
    tx: Prisma.TransactionClient,
    before: RequisitionRecord,
    data: Prisma.RequisitionUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.requisition.updateMany({ where: { id: before.id, updatedAt: before.updatedAt }, data });
    if (count === 0) {
      throw conflict('requisition.changed', 'This requisition was changed by someone else. Reload it and try again.');
    }
  }

  private writeSteps(tx: Prisma.TransactionClient, requisitionId: string, steps: Step[]) {
    return tx.requisitionStep.createMany({
      data: steps.map((s) => ({
        requisitionId,
        position: s.position,
        label: s.label,
        status: s.status,
        decidedById: s.decidedById,
        decidedAt: s.decidedAt,
        note: s.note,
      })),
    });
  }
}

/** Audit-friendly copy: dates as YYYY-MM-DD. Requisitions hold no sensitive personal fields. */
function auditable(d: RequisitionData): Record<string, Prisma.InputJsonValue | null> {
  return { ...d, targetStart: d.targetStart.toISOString().slice(0, 10) };
}

const pick = <T extends Record<string, unknown>>(o: T, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k] ?? null])) as Prisma.InputJsonObject;

export const chainSummary = (chain: { status: RequisitionStatus; steps: Step[] }): Prisma.InputJsonObject => ({
  status: chain.status,
  steps: chain.steps.map((s) => `${s.label}:${s.status}`),
});
