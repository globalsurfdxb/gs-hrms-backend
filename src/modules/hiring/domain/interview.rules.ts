import { AppError, conflict } from '../../../shared/errors/app-error.js';
import { STAGES, type Exit, type Stage } from './application.rules.js';

/* Pure business rules for interviews (BR-HIR-010) — no Nest, no Prisma. Unit-tested in interview.rules.spec.ts.
   Source of behaviour: gs-hrms lib/hiringStore.ts (scheduleInterview, rescheduleInterview, setInterviewStatus,
   panelClashes) and components/hiring/HiringForms.tsx (InterviewForm). The store does not guard status changes; the
   rules here follow what the screens offer: only a SCHEDULED interview is rescheduled, completed or cancelled. */

export const INTERVIEW_ROUNDS = ['SCREENING_CALL', 'TECHNICAL', 'HR', 'FINAL'] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];
export const INTERVIEW_MODES = ['IN_PERSON', 'TEAMS', 'PHONE'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
/** The durations the form offers, in minutes (also a DB check). */
export const INTERVIEW_DURATIONS = [30, 45, 60, 90, 120] as const;
export const PANEL_MAX = 10;
export const NOTES_MAX = 2000;

/** The stage a round belongs to; the final round has none (frontend ROUND_STAGE). */
export const ROUND_STAGE: Record<InterviewRound, Stage | null> = {
  SCREENING_CALL: 'SCREENING',
  TECHNICAL: 'TECHNICAL_INTERVIEW',
  HR: 'HR_INTERVIEW',
  FINAL: null,
};

type JobStatus = 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED';

/** BR-HIR-010: interviews only for an application still in the pipeline, on a job that is not closed or filled. */
export function assertCanInterview(a: { stage: Stage; exit: Exit | null; jobStatus: JobStatus }): void {
  if (a.exit || a.stage === 'HIRED') {
    throw conflict('interview.application_inactive', 'This candidate is no longer in the pipeline');
  }
  if (a.jobStatus === 'CLOSED' || a.jobStatus === 'FILLED') {
    throw conflict('interview.job_closed', 'This job is closed or filled; reopen it to schedule interviews');
  }
}

export interface InterviewTimeCheck {
  startsAt: Date;
  now: Date;
  /** De-duplicated. */
  panelIds: readonly string[];
  /** Trimmed; '' = none. */
  link: string;
}

/** BR-HIR-010: not in the past, at least one panelist (at most PANEL_MAX), and an https link when one is given. */
export function checkInterviewInput(i: InterviewTimeCheck): void {
  if (i.startsAt.getTime() < i.now.getTime()) {
    throw new AppError('interview.in_past', 'The interview time is in the past');
  }
  if (i.panelIds.length === 0) throw new AppError('interview.panel_required', 'Add at least one panel member');
  if (i.panelIds.length > PANEL_MAX) {
    throw new AppError('interview.panel_too_large', `At most ${PANEL_MAX} panel members`);
  }
  if (i.link && !/^https:\/\/\S+$/i.test(i.link)) {
    throw new AppError('interview.invalid_link', 'Enter a full meeting link starting with https://');
  }
}

/** Scheduling a round moves the candidate forward to its stage, never back (frontend scheduleInterview). */
export function stageAfterScheduling(current: Stage, round: InterviewRound): Stage | null {
  const target = ROUND_STAGE[round];
  if (!target) return null;
  return STAGES.indexOf(target) > STAGES.indexOf(current) ? target : null;
}

/** Only a scheduled interview can be rescheduled, completed or cancelled. */
export function assertScheduled(status: InterviewStatus): void {
  if (status !== 'SCHEDULED') {
    throw conflict('interview.not_scheduled', `This interview is ${status.toLowerCase()} and cannot be changed`);
  }
}

/** Two time ranges [start, end) overlap. */
export const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

export const endOf = (startsAt: Date, durationMin: number): Date => new Date(startsAt.getTime() + durationMin * 60_000);
