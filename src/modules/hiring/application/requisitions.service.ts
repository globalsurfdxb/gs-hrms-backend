import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, forbidden, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay, dayOf, todayIn } from '../../../shared/time/calendar-day.js';
import type { CreateRequisitionDto } from '../api/dto/create-requisition.dto.js';
import type { DecideRequisitionDto } from '../api/dto/decide-requisition.dto.js';
import type { ListRequisitionsQuery } from '../api/dto/list-requisitions.query.js';
import { RequisitionListResponse, RequisitionResponse } from '../api/dto/requisition.response.js';
import type { UpdateRequisitionDto } from '../api/dto/update-requisition.dto.js';
import {
  assertEditable,
  assertTransition,
  checkRequisitionInput,
  decidableLabels,
  decideStep,
  statusAfter,
  stepsForSubmit,
  toMinor,
  type StatusAction,
  type Step,
} from '../domain/requisition.rules.js';
import {
  chainSummary,
  RequisitionsRepository,
  type RequisitionData,
  type RequisitionRecord,
  type RequisitionScope,
} from '../infrastructure/requisitions.repository.js';

const STATUS_AUDIT: Record<StatusAction, string> = {
  hold: 'requisition.held',
  resume: 'requisition.resumed',
  close: 'requisition.closed',
};

/* Use cases for requisitions (spec docs/modules/hiring.md, step 1). No HTTP and no Prisma here.
   Record-level access: callers only reach requisitions in their scope (404 otherwise); within it, editing needs
   to be the raiser, the hiring manager or a recruiting user, and hold/resume/close needs a recruiting user. */
@Injectable()
export class RequisitionsService {
  constructor(private readonly requisitions: RequisitionsRepository) {}

  async list(query: ListRequisitionsQuery, user: AuthUser): Promise<RequisitionListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.requisitions.list(
      scopeOf(user),
      { status: query.status, locationId: query.locationId, waitingOnMe: query.waitingOnMe },
      page,
      pageSize,
    );
    const viewer = viewerOf(user);
    return { items: items.map((r) => RequisitionResponse.from(r, viewer)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<RequisitionResponse> {
    return RequisitionResponse.from(await this.visible(id, user), viewerOf(user));
  }

  async create(dto: CreateRequisitionDto, user: AuthUser): Promise<RequisitionResponse> {
    const draft: RequisitionData = {
      title: dto.title.trim(),
      companyId: dto.companyId,
      departmentId: dto.departmentId,
      designationId: dto.designationId ?? null,
      locationId: dto.locationId,
      positions: dto.positions,
      employmentType: dto.employmentType,
      reason: dto.reason,
      replacesEmployeeId: dto.reason === 'REPLACEMENT' ? (dto.replacesEmployeeId ?? null) : null,
      budgetMin: dto.budgetMin,
      budgetMax: dto.budgetMax,
      currency: '',
      targetStart: dateOfDay(dto.targetStart),
      hiringManagerId: dto.hiringManagerId,
      justification: dto.justification.trim(),
    };
    const data = await this.checked(draft);
    const chain = dto.submit ? this.submitChain(user.employeeId, data.hiringManagerId) : null;
    const created = await this.requisitions.create(data, chain, actorOf(user));
    return RequisitionResponse.from(created, viewerOf(user));
  }

  async update(id: string, dto: UpdateRequisitionDto, user: AuthUser): Promise<RequisitionResponse> {
    const before = await this.editable(id, user);
    const current = dataOf(before);

    const next: RequisitionData = {
      ...current,
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.companyId !== undefined && { companyId: dto.companyId }),
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      ...(dto.designationId !== undefined && { designationId: dto.designationId }),
      ...(dto.locationId !== undefined && { locationId: dto.locationId }),
      ...(dto.positions !== undefined && { positions: dto.positions }),
      ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
      ...(dto.reason !== undefined && { reason: dto.reason }),
      ...(dto.replacesEmployeeId !== undefined && { replacesEmployeeId: dto.replacesEmployeeId }),
      ...(dto.budgetMin !== undefined && { budgetMin: dto.budgetMin }),
      ...(dto.budgetMax !== undefined && { budgetMax: dto.budgetMax }),
      ...(dto.targetStart !== undefined && { targetStart: dateOfDay(dto.targetStart) }),
      ...(dto.hiringManagerId !== undefined && { hiringManagerId: dto.hiringManagerId }),
      ...(dto.justification !== undefined && { justification: dto.justification.trim() }),
    };
    // A department from another company cannot survive a company change.
    if (dto.companyId !== undefined && dto.departmentId === undefined && dto.companyId !== current.companyId) {
      throw new AppError('requisition.department_mismatch', 'Choose a department of the new company');
    }
    if (
      dto.departmentId !== undefined &&
      dto.designationId === undefined &&
      dto.departmentId !== current.departmentId
    ) {
      next.designationId = null;
    }
    if (next.reason !== 'REPLACEMENT') next.replacesEmployeeId = null;

    const data = await this.checked(next);
    const changes = diff(current, data);
    if (Object.keys(changes).length === 0) return RequisitionResponse.from(before, viewerOf(user));
    return RequisitionResponse.from(
      await this.requisitions.update(before, current, changes, actorOf(user)),
      viewerOf(user),
    );
  }

  /** BR-HIR-001: (re)submit into the approval chain. */
  async submit(id: string, user: AuthUser): Promise<RequisitionResponse> {
    const before = await this.editable(id, user);
    // The stored values are checked again: a rejected requisition may have a start date that has since passed.
    await this.checked(dataOf(before));
    const chain = this.submitChain(user.employeeId, before.hiringManager.id);
    assertTransition(before.status, chain.status);
    const saved = await this.requisitions.saveChain(
      before,
      chain,
      'requisition.submitted',
      chainSummary(chain),
      actorOf(user),
    );
    return RequisitionResponse.from(saved, viewerOf(user));
  }

  /** BR-HIR-002: approve or reject the pending step. */
  async decide(id: string, dto: DecideRequisitionDto, user: AuthUser): Promise<RequisitionResponse> {
    const before = await this.visible(id, user);
    const result = decideStep(
      before.status,
      before.steps.map(stepOf),
      { hiringManagerId: before.hiringManager.id, raisedById: before.createdBy.id },
      { employeeId: user.employeeId, roleName: user.roleName },
      dto.decision,
      dto.note ?? '',
      new Date(),
    );
    const action = dto.decision === 'APPROVED' ? 'requisition.step_approved' : 'requisition.step_rejected';
    const saved = await this.requisitions.saveChain(
      before,
      { status: result.status, steps: result.steps },
      action,
      { step: result.decided.label, decision: dto.decision, note: result.decided.note, status: result.status },
      actorOf(user),
    );
    return RequisitionResponse.from(saved, viewerOf(user));
  }

  /** BR-HIR-004: hold, resume or close an approved requisition (recruiting users only). */
  async changeStatus(id: string, action: StatusAction, user: AuthUser): Promise<RequisitionResponse> {
    const before = await this.visible(id, user);
    if (!viewerOf(user).seesAll) {
      throw forbidden('requisition.not_allowed', 'Only HR can put a requisition on hold, resume or close it');
    }
    const status = statusAfter(action, before.status);
    return RequisitionResponse.from(
      await this.requisitions.setStatus(before, status, STATUS_AUDIT[action], actorOf(user)),
      viewerOf(user),
    );
  }

  /* ---------------------------------------------------------------- helpers */

  private async visible(id: string, user: AuthUser): Promise<RequisitionRecord> {
    const r = await this.requisitions.findVisible(id, scopeOf(user));
    if (!r) throw notFound('requisition');
    return r;
  }

  /** BR-HIR-001 + record rule: a draft/rejected requisition the caller raised, manages, or (HR) runs. */
  private async editable(id: string, user: AuthUser): Promise<RequisitionRecord> {
    const r = await this.visible(id, user);
    const viewer = viewerOf(user);
    const involved = viewer.seesAll || r.createdBy.id === viewer.employeeId || r.hiringManager.id === viewer.employeeId;
    if (!involved)
      throw forbidden('requisition.not_allowed', 'Only the requester, the hiring manager or HR can change this');
    assertEditable(r.status);
    return r;
  }

  private submitChain(submitterId: string, hiringManagerId: string): { status: 'PENDING_APPROVAL'; steps: Step[] } {
    return { status: 'PENDING_APPROVAL', steps: stepsForSubmit(submitterId, hiringManagerId, new Date()) };
  }

  /** Checks every reference and BR-HIR-003; returns the data with the location's currency. */
  private async checked(d: RequisitionData): Promise<RequisitionData> {
    const [location, company, department, designation, manager, replaced] = await Promise.all([
      this.requisitions.location(d.locationId),
      this.requisitions.company(d.companyId),
      this.requisitions.department(d.departmentId),
      d.designationId ? this.requisitions.designation(d.designationId) : null,
      this.requisitions.hiringManager(d.hiringManagerId),
      d.replacesEmployeeId ? this.requisitions.employee(d.replacesEmployeeId) : null,
    ]);
    if (!location) throw new AppError('requisition.unknown_location', `Unknown location "${d.locationId}"`);
    if (!company || company.status !== 'ACTIVE') {
      throw new AppError('requisition.unknown_company', 'Choose an active company');
    }
    if (!department || department.companyId !== d.companyId) {
      throw new AppError('requisition.department_mismatch', 'The department does not belong to that company');
    }
    if (d.designationId && designation?.departmentId !== d.departmentId) {
      throw new AppError('requisition.designation_mismatch', 'The designation does not belong to that department');
    }
    if (!manager || manager.employmentStatus !== 'ACTIVE') {
      throw new AppError('requisition.invalid_hiring_manager', 'The hiring manager must be an active employee');
    }
    // Q11: the hiring manager must be able to decide their step — checked by permission, so custom roles qualify.
    if (
      !hasPermission(
        new Set(manager.role.permissions.map((p) => p.key)),
        PERMISSIONS.hiring.requisitionApprovals,
        'edit',
      )
    ) {
      throw new AppError(
        'requisition.hiring_manager_no_access',
        'The hiring manager needs Requisition approvals access (Team Lead and above by default)',
      );
    }
    if (d.replacesEmployeeId && !replaced) {
      throw new AppError('requisition.unknown_employee', 'The employee being replaced was not found');
    }
    checkRequisitionInput({
      positions: d.positions,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax,
      targetStart: dayOf(d.targetStart),
      today: todayIn(location.timezone),
      reason: d.reason,
      replacesEmployeeId: d.replacesEmployeeId,
    });
    return { ...d, currency: location.currency };
  }
}

/** Recruiting users (Jobs → View: HR, Super Admin by default) see and manage every requisition. */
const seesAll = (user: AuthUser) => hasPermission(user.permissions, PERMISSIONS.hiring.jobs);

const viewerOf = (user: AuthUser) => ({
  employeeId: user.employeeId,
  roleName: user.roleName,
  seesAll: seesAll(user),
  canAddJob: hasPermission(user.permissions, PERMISSIONS.hiring.jobs, 'add'),
});

const scopeOf = (user: AuthUser): RequisitionScope => ({
  all: seesAll(user),
  employeeId: user.employeeId,
  decidableLabels: decidableLabels(user.roleName),
});

const stepOf = (s: RequisitionRecord['steps'][number]): Step => ({
  position: s.position,
  label: s.label,
  status: s.status,
  decidedById: s.decidedById,
  decidedAt: s.decidedAt,
  note: s.note,
});

function dataOf(r: RequisitionRecord): RequisitionData {
  return {
    title: r.title,
    companyId: r.company.id,
    departmentId: r.department.id,
    designationId: r.designation?.id ?? null,
    locationId: r.location.id,
    positions: r.positions,
    employmentType: r.employmentType,
    reason: r.reason,
    replacesEmployeeId: r.replaces?.id ?? null,
    budgetMin: r.budgetMin.toFixed(2),
    budgetMax: r.budgetMax.toFixed(2),
    currency: r.currency,
    targetStart: r.targetStart,
    hiringManagerId: r.hiringManager.id,
    justification: r.justification,
  };
}

/** Fields whose value changed. Amounts compare in minor units ("9000" = "9000.00"), dates as days. */
function diff(a: RequisitionData, b: RequisitionData): Partial<RequisitionData> {
  const same = (k: keyof RequisitionData) => {
    if (k === 'targetStart') return dayOf(a.targetStart) === dayOf(b.targetStart);
    if (k === 'budgetMin' || k === 'budgetMax') return toMinor(a[k]) === toMinor(b[k]);
    return a[k] === b[k];
  };
  const keys = (Object.keys(b) as (keyof RequisitionData)[]).filter((k) => !same(k));
  return Object.fromEntries(keys.map((k) => [k, b[k]])) as Partial<RequisitionData>;
}
