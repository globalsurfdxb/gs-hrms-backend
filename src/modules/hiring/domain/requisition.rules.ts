import { AppError, conflict, forbidden } from '../../../shared/errors/app-error.js';

/* Pure business rules for requisitions — no Nest, no Prisma. Unit-tested in requisition.rules.spec.ts.
   Rule ids refer to docs/modules/hiring.md. Source of behaviour: gs-hrms lib/hiringStore.ts (requisitions). */

export type RequisitionStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'CLOSED';
export type StepLabel = 'HIRING_MANAGER' | 'HR' | 'MANAGEMENT';
export type StepStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type Decision = 'APPROVED' | 'REJECTED';

/** The fixed approval chain, in order (lead decision 2026-10-22; frontend lib/workflow.ts 'requisition'). */
export const APPROVAL_CHAIN: readonly StepLabel[] = ['HIRING_MANAGER', 'HR', 'MANAGEMENT'];

export interface Step {
  position: number;
  label: StepLabel;
  status: StepStatus;
  decidedById: string | null;
  decidedAt: Date | null;
  note: string | null;
}

/** The person acting, as the rules need them. Role names are the system roles (frontend `canDecideStep`). */
export interface Actor {
  employeeId: string;
  roleName: string;
}

/** Every allowed status change. Submit/decide move DRAFT/REJECTED/PENDING_APPROVAL; HR moves the rest. */
export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, readonly RequisitionStatus[]> = {
  DRAFT: ['PENDING_APPROVAL'],
  REJECTED: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'],
  APPROVED: ['ON_HOLD', 'CLOSED'],
  ON_HOLD: ['APPROVED', 'CLOSED'],
  CLOSED: [],
};

/** BR-HIR-004: only the transitions in the state diagram. */
export function assertTransition(from: RequisitionStatus, to: RequisitionStatus): void {
  if (!REQUISITION_TRANSITIONS[from].includes(to)) {
    throw conflict('requisition.invalid_transition', `A ${from} requisition cannot become ${to}`);
  }
}

/** BR-HIR-001: only a draft or a rejected requisition can be edited or (re)submitted. */
export function assertEditable(status: RequisitionStatus): void {
  if (status !== 'DRAFT' && status !== 'REJECTED') {
    throw conflict('requisition.not_editable', 'Only a draft or rejected requisition can be changed');
  }
}

/* ---------------------------------------------------------------------- input (BR-HIR-003) */

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** A money amount as sent by the API ("9000", "9000.50") in minor units, so comparisons never use floats. */
export function toMinor(amount: string): bigint {
  if (!AMOUNT.test(amount)) throw new AppError('requisition.invalid_amount', `"${amount}" is not a valid amount`);
  const [whole, frac = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

export interface RequisitionInputCheck {
  positions: number;
  budgetMin: string;
  budgetMax: string;
  /** YYYY-MM-DD */
  targetStart: string;
  /** Today in the requisition location's timezone, YYYY-MM-DD. */
  today: string;
  reason: 'NEW_ROLE' | 'REPLACEMENT';
  replacesEmployeeId: string | null;
}

/** BR-HIR-003: positions ≥ 1; 0 < budgetMin ≤ budgetMax; start not in the past; a replacement names the employee. */
export function checkRequisitionInput(i: RequisitionInputCheck): void {
  if (!Number.isInteger(i.positions) || i.positions < 1) {
    throw new AppError('requisition.invalid_positions', 'Enter 1 or more positions');
  }
  const min = toMinor(i.budgetMin);
  const max = toMinor(i.budgetMax);
  if (min <= 0n) throw new AppError('requisition.invalid_budget', 'The budget minimum must be more than zero');
  if (max < min) throw new AppError('requisition.invalid_budget', 'The budget maximum is below the minimum');
  if (i.targetStart < i.today) throw new AppError('requisition.start_in_past', 'The target start date is in the past');
  if (i.reason === 'REPLACEMENT' && !i.replacesEmployeeId) {
    throw new AppError('requisition.replacement_required', 'Choose the employee being replaced');
  }
}

/* ---------------------------------------------------------------------- approval chain */

/** BR-HIR-001: a fresh chain on (re)submit. When the submitter is the hiring manager, their own step is approved
    straight away and the HR step is waiting for a decision. */
export function stepsForSubmit(submitterId: string, hiringManagerId: string, now: Date): Step[] {
  const selfApproved = submitterId === hiringManagerId;
  return APPROVAL_CHAIN.map((label, i) => {
    const step: Step = { position: i + 1, label, status: 'WAITING', decidedById: null, decidedAt: null, note: null };
    if (i === 0)
      return selfApproved
        ? { ...step, status: 'APPROVED', decidedById: submitterId, decidedAt: now }
        : { ...step, status: 'PENDING' };
    if (i === 1 && selfApproved) return { ...step, status: 'PENDING' };
    return step;
  });
}

export const pendingStep = (steps: readonly Step[]): Step | undefined => steps.find((s) => s.status === 'PENDING');

/** Who decides each step. Super Admin may decide any step. */
export const DECIDERS: Record<Exclude<StepLabel, 'HIRING_MANAGER'>, readonly string[]> = {
  HR: ['HR', 'Office Admin'],
  MANAGEMENT: ['Super Admin'],
};

/** The people a requisition belongs to. */
export interface Parties {
  hiringManagerId: string;
  raisedById: string;
}

/** BR-HIR-002: Hiring Manager step → that manager; HR step → HR or Office Admin; Management → Super Admin (who may
    decide any step). Nobody decides any step of a requisition they raised (security.md §2) — except the hiring
    manager their own step, which BR-HIR-001 approves on submit when they submit it themselves. */
export function canDecideStep(label: StepLabel, actor: Actor, parties: Parties): boolean {
  if (label === 'HIRING_MANAGER' && actor.employeeId === parties.hiringManagerId) return true;
  if (actor.employeeId === parties.raisedById) return false;
  if (actor.roleName === 'Super Admin') return true;
  return label !== 'HIRING_MANAGER' && DECIDERS[label].includes(actor.roleName);
}

/** The step labels a person could decide on someone else's requisition (used to scope the approval inbox). */
export function decidableLabels(roleName: string): StepLabel[] {
  if (roleName === 'Super Admin') return [...APPROVAL_CHAIN];
  return (Object.keys(DECIDERS) as (keyof typeof DECIDERS)[]).filter((l) => DECIDERS[l].includes(roleName));
}

/** BR-HIR-002: decide the pending step. Approving opens the next step, or approves the requisition after the last
    one; rejecting (note required) rejects the requisition. Returns the new steps and status. */
export function decideStep(
  status: RequisitionStatus,
  steps: readonly Step[],
  parties: Parties,
  actor: Actor,
  decision: Decision,
  note: string,
  now: Date,
): { steps: Step[]; status: RequisitionStatus; decided: Step } {
  if (status !== 'PENDING_APPROVAL')
    throw conflict('requisition.not_pending', 'This requisition is not waiting for a decision');
  const current = pendingStep(steps);
  if (!current) throw conflict('requisition.not_pending', 'No approval step is waiting for a decision');
  if (!canDecideStep(current.label, actor, parties)) {
    throw actor.employeeId === parties.raisedById
      ? forbidden('requisition.own_request', 'You cannot approve a requisition you raised')
      : forbidden('requisition.not_your_step', 'This approval step is not yours to decide');
  }
  const text = note.trim();
  if (decision === 'REJECTED' && !text)
    throw new AppError('requisition.note_required', 'Add a short note explaining the rejection');

  const decided: Step = {
    ...current,
    status: decision,
    decidedById: actor.employeeId,
    decidedAt: now,
    note: text || null,
  };
  const next = steps.map((s) => {
    if (s.position === current.position) return decided;
    if (decision === 'APPROVED' && s.position === current.position + 1) return { ...s, status: 'PENDING' as const };
    return s;
  });
  const last = current.position === steps.length;
  const newStatus: RequisitionStatus = decision === 'REJECTED' ? 'REJECTED' : last ? 'APPROVED' : 'PENDING_APPROVAL';
  assertTransition(status, newStatus);
  return { steps: next, status: newStatus, decided };
}

/* ---------------------------------------------------------------------- hold / resume / close (BR-HIR-004) */

export type StatusAction = 'hold' | 'resume' | 'close';
export const STATUS_ACTION_TARGET: Record<StatusAction, RequisitionStatus> = {
  hold: 'ON_HOLD',
  resume: 'APPROVED',
  close: 'CLOSED',
};

export function statusAfter(action: StatusAction, from: RequisitionStatus): RequisitionStatus {
  const to = STATUS_ACTION_TARGET[action];
  // Resume means "back from hold" only — not a way to approve a requisition.
  if (action === 'resume' && from !== 'ON_HOLD')
    throw conflict('requisition.invalid_transition', 'Only a requisition on hold can be resumed');
  assertTransition(from, to);
  return to;
}
