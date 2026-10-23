import { AppError, conflict } from '../../../shared/errors/app-error.js';

/* Pure business rules for jobs — no Nest, no Prisma. Unit-tested in job.rules.spec.ts.
   Rule ids refer to docs/modules/hiring.md. Source of behaviour: gs-hrms lib/hiringStore.ts (createJob,
   setJobStatus, setJobRecruiter), app/hiring/jobs/[id]/page.tsx (which status buttons exist) and
   components/hiring/HiringForms.tsx (JobForm validation). */

export type JobStatus = 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED';

/** People may only move a job along these; FILLED (and back to OPEN) is set by the system from filled/positions. */
export type JobAction = 'open' | 'hold' | 'resume' | 'close' | 'reopen';

const ACTIONS: Record<JobAction, { from: readonly JobStatus[]; to: JobStatus; verb: string }> = {
  open: { from: ['DRAFT'], to: 'OPEN', verb: 'opened' },
  hold: { from: ['OPEN'], to: 'ON_HOLD', verb: 'held' },
  resume: { from: ['ON_HOLD'], to: 'OPEN', verb: 'resumed' },
  close: { from: ['OPEN', 'ON_HOLD'], to: 'CLOSED', verb: 'closed' },
  reopen: { from: ['CLOSED'], to: 'OPEN', verb: 'reopened' },
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  ON_HOLD: 'On Hold',
  CLOSED: 'Closed',
  FILLED: 'Filled',
};

/** BR-HIR-006: the status after a person's action, or 409. Reopen only while positions are left to fill. */
export function jobStatusAfter(
  action: JobAction,
  job: { status: JobStatus; filled: number; positions: number },
): { status: JobStatus; verb: string } {
  const rule = ACTIONS[action];
  if (!rule.from.includes(job.status)) {
    throw conflict(
      'job.invalid_transition',
      `A ${JOB_STATUS_LABEL[job.status].toLowerCase()} job cannot be ${rule.verb}`,
    );
  }
  if (action === 'reopen' && job.filled >= job.positions) {
    throw conflict('job.no_open_positions', 'Every position is filled; the job cannot be reopened');
  }
  return { status: rule.to, verb: rule.verb };
}

/** The status buttons to show for a job (the frontend's job page). */
export const allowedJobActions = (job: { status: JobStatus; filled: number; positions: number }): JobAction[] =>
  (Object.keys(ACTIONS) as JobAction[]).filter(
    (a) => ACTIONS[a].from.includes(job.status) && (a !== 'reopen' || job.filled < job.positions),
  );

/** BR-HIR-005: a job only from an APPROVED requisition that has no job yet. */
export function assertCanCreateJob(requisition: { status: string; hasJob: boolean }): void {
  if (requisition.status !== 'APPROVED') {
    throw conflict('job.requisition_not_approved', 'A job can only be created from an approved requisition');
  }
  if (requisition.hasJob) throw conflict('job.already_exists', 'This requisition already has a job');
}

export interface JobInputCheck {
  description: string;
  skills: string[];
  expMin: number;
  expMax: number;
  panelIds: string[];
}

/** BR-HIR-005: description, at least one skill, 0 ≤ expMin ≤ expMax, at least one interviewer. Returns the input
    with skills trimmed and de-duplicated (case-insensitive) and the panel de-duplicated. */
export function checkJobInput(i: JobInputCheck): JobInputCheck {
  const description = i.description.trim();
  if (!description) throw new AppError('job.description_required', 'Add a job description');
  const seen = new Set<string>();
  const skills = i.skills
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  if (!skills.length) throw new AppError('job.skills_required', 'List at least one key skill');
  if (i.expMin < 0 || i.expMax < i.expMin) {
    throw new AppError('job.invalid_experience', 'The experience maximum is below the minimum');
  }
  const panelIds = [...new Set(i.panelIds)];
  if (!panelIds.length) throw new AppError('job.panel_required', 'Add at least one interviewer');
  return { description, skills, expMin: i.expMin, expMax: i.expMax, panelIds };
}

/** History text, as the frontend writes it. */
export const jobHistory = {
  created: (requisitionCode: string, status: JobStatus) =>
    `Job created from ${requisitionCode} as ${JOB_STATUS_LABEL[status]}`,
  status: (from: JobStatus, to: JobStatus) =>
    `Status changed from ${JOB_STATUS_LABEL[from]} to ${JOB_STATUS_LABEL[to]}`,
  recruiter: (from: string, to: string) => `Recruiter changed from ${from} to ${to}`,
};
