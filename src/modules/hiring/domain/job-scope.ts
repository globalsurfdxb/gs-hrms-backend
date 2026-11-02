/* BR-HIR-022 — own jobs. A job is someone's own when they are its hiring manager (from the requisition) or its
   recruiter. People with full hiring access see every job; everyone else who reaches the recruiting screens
   (Recruiter, a hiring manager) sees and acts on their own jobs only, and on the candidates and applications on them.
   The repositories apply the same rule in their queries (security rule 8); this file is the rule itself. */

export interface HiringScope {
  /** Full hiring access: every requisition, job, candidate and salary. */
  readonly all: boolean;
  readonly employeeId: string;
}

export interface JobParties {
  hiringManagerId: string;
  recruiterId: string | null;
}

export const isOwnJob = (job: JobParties, employeeId: string): boolean =>
  job.hiringManagerId === employeeId || job.recruiterId === employeeId;

/** Salary (current, expected, offered) on a candidate: full access, or the hiring manager or recruiter of one of the
    candidate's jobs (frontend `canSeeSalary`, spec §6). */
export const canSeeSalary = (scope: HiringScope, jobs: readonly JobParties[]): boolean =>
  scope.all || jobs.some((j) => isOwnJob(j, scope.employeeId));
