/* BR-HIR-021 — recruiter hand-over, as the frontend has it (gs-hrms lib/hiringAccess.ts, lib/hiringStore.ts
   createJob / setJobRecruiter, `8609a8e`). The Talent Acquisition team is found by designation title, like the
   frontend (decided 2026-11-02, spec Q21): the TA Manager is the active employee titled "Talent Acquisition Manager";
   the team is the active "Recruiter"s and the TA Manager. Pure: callers pass in who is who. */

export const TA_MANAGER_TITLE = 'Talent Acquisition Manager';
export const RECRUITER_TITLE = 'Recruiter';
const TA_MANAGER_ROLE = 'Talent Acquisition Manager';
const SUPER_ADMIN = 'Super Admin';

export interface RecruiterActor {
  employeeId: string;
  roleName: string;
  /** The actor's designation title, if any. */
  designation: string | null;
}

/** Whether the actor is the Talent Acquisition Manager — by role or by designation, as the frontend checks both. */
export const isTaManager = (a: RecruiterActor): boolean =>
  a.roleName === TA_MANAGER_ROLE || a.designation === TA_MANAGER_TITLE;

/** A new job goes to the TA Manager, who chooses the recruiter — unless there is none, or the creator is the TA
    Manager or a Super Admin, who choose straight away. */
export const handsOver = (creator: RecruiterActor, taManager: { id: string } | null): boolean =>
  !!taManager && !isTaManager(creator) && creator.roleName !== SUPER_ADMIN;

/** Choosing or changing a job's recruiter: Super Admin, any TA Manager, the TA Manager the job was handed to; on a job
    with no TA Manager (none existed when it was made), anyone with full hiring access (frontend: HR, Office Admin). */
export function canChooseRecruiter(actor: RecruiterActor, job: { taManagerId: string | null }, fullAccess: boolean) {
  if (actor.roleName === SUPER_ADMIN || isTaManager(actor)) return true;
  if (job.taManagerId === actor.employeeId) return true;
  return !job.taManagerId && fullAccess;
}

/** Who can run a job: with a TA Manager in place, a member of the Talent Acquisition team; otherwise anyone. */
export const canRecruit = (designation: string | null, teamExists: boolean): boolean =>
  !teamExists || designation === RECRUITER_TITLE || designation === TA_MANAGER_TITLE;
