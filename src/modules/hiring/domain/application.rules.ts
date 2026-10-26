import { AppError, conflict } from '../../../shared/errors/app-error.js';

/* Pure business rules for applications and the pipeline — no Nest, no Prisma. Unit-tested in
   application.rules.spec.ts. Rule ids refer to docs/modules/hiring.md. Source of behaviour: gs-hrms
   lib/hiringStore.ts (applyToJob, moveStage, exitApplication, reopenApplication) and lib/hiringTypes.ts. */

export const STAGES = ['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'OFFER', 'HIRED'] as const;
export type Stage = (typeof STAGES)[number];
/** The stages people move candidates between; HIRED is set only by an accepted offer (BR-HIR-013). */
export const MOVABLE_STAGES = STAGES.filter((s) => s !== 'HIRED') as Exclude<Stage, 'HIRED'>[];

export const EXITS = ['REJECTED', 'WITHDRAWN', 'ON_HOLD'] as const;
export type Exit = (typeof EXITS)[number];

/** Frontend REJECTION_REASONS, stored as written. */
export const REJECTION_REASONS = [
  'Skills mismatch',
  'Insufficient experience',
  'Salary expectations too high',
  'Failed technical interview',
  'Cultural fit',
  'Notice period too long',
  'Visa / work-permit constraint',
  'Better candidate selected',
  'Position closed or on hold',
  'No response from candidate',
  'Other',
] as const;

type JobStatus = 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED';

/** An application as the rules need it. `offerSent`: its offer is out with the candidate (status SENT). */
export interface PipelineState {
  stage: Stage;
  exit: Exit | null;
  exitFrom: Stage | null;
  jobStatus: JobStatus;
  offerSent: boolean;
}

/** The new pipeline fields and the history line to append. `from`/`to` are stage or exit codes. */
export interface PipelineChange {
  stage: Stage;
  exit: Exit | null;
  exitFrom: Stage | null;
  exitReason: string | null;
  exitNote: string | null;
  history: { from: string; to: string; note: string | null };
}

/** BR-HIR-008: one application per candidate per job, only to an OPEN job. */
export function assertCanApply(job: { status: JobStatus }, alreadyApplied: boolean): void {
  if (job.status !== 'OPEN') throw conflict('application.job_not_open', 'Candidates can only apply to an open job');
  if (alreadyApplied) throw conflict('application.already_applied', 'This candidate has already applied to this job');
}

const OFFER_OUT = 'The offer letter is out with the candidate. Withdraw the offer first (Offers → Withdraw link).';

function assertNotHired(a: PipelineState): void {
  if (a.stage === 'HIRED') throw conflict('application.already_hired', 'This candidate has already been hired');
}

/** BR-HIR-009: move to another stage (also brings an exited application back). Returns null when nothing changes. */
export function moveStage(a: PipelineState, to: Stage, note: string | null = null): PipelineChange | null {
  if (to === 'HIRED') {
    throw new AppError('application.hired_by_offer', 'Hired is set when the candidate accepts an offer');
  }
  assertNotHired(a);
  if (a.stage === to && !a.exit) return null;
  if (a.jobStatus === 'CLOSED' || a.jobStatus === 'FILLED') {
    throw conflict('application.job_closed', 'This job is closed or filled; reopen it to move candidates');
  }
  if (a.offerSent && a.stage === 'OFFER' && to !== 'OFFER') throw conflict('application.offer_out', OFFER_OUT);
  return {
    stage: to,
    exit: null,
    exitFrom: null,
    exitReason: null,
    exitNote: null,
    history: { from: a.exit ?? a.stage, to, note: note?.trim() || null },
  };
}

/** BR-HIR-009: take a candidate out of the pipeline. Rejecting needs one of the reasons. Changing the exit of an
    exited application keeps the stage it originally left from. */
export function exitApplication(
  a: PipelineState,
  exit: Exit,
  reason: string | null,
  note: string | null,
): PipelineChange {
  assertNotHired(a);
  if (a.offerSent) throw conflict('application.offer_out', OFFER_OUT);
  const why = reason?.trim() || null;
  if (exit === 'REJECTED' && !why) throw new AppError('application.reason_required', 'Choose a rejection reason');
  if (exit === 'REJECTED' && !(REJECTION_REASONS as readonly string[]).includes(why!)) {
    throw new AppError('application.invalid_reason', 'Choose one of the rejection reasons');
  }
  const text = note?.trim() || null;
  return {
    stage: a.stage,
    exit,
    exitFrom: a.exit ? a.exitFrom : a.stage,
    exitReason: why,
    exitNote: text,
    history: { from: a.exit ?? a.stage, to: exit, note: [why, text].filter(Boolean).join(' — ') || null },
  };
}

/** BR-HIR-009: back to the stage it left from. */
export function reopenApplication(a: PipelineState): PipelineChange {
  if (!a.exit) throw conflict('application.not_exited', 'This application is not closed out');
  return moveStage(a, a.exitFrom ?? 'APPLIED', 'Reopened')!;
}

/** The first history line of a new application. */
export const appliedHistory = { from: null, to: 'APPLIED' as const, note: null };
