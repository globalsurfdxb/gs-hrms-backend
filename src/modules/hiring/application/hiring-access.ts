import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { forbidden } from '../../../shared/errors/app-error.js';
import type { HiringScope } from '../domain/job-scope.js';

/* Who has full hiring access (decided 2026-11-02, spec Q22): both halves of the module — Jobs → View AND
   Requisitions → View. By default that is Super Admin, HR and the Talent Acquisition Manager. A Recruiter (Recruiting
   only) and a Team Lead (Requisitions only) work on their own jobs (BR-HIR-022). Decided by permission, never by role
   name, so custom roles follow their grants; until the frontend has a dedicated "all jobs" permission this is the
   signal. */
export const hasFullHiringAccess = (user: AuthUser): boolean =>
  hasPermission(user.permissions, PERMISSIONS.hiring.jobs) &&
  hasPermission(user.permissions, PERMISSIONS.hiring.requisitions);

export const hiringScopeOf = (user: AuthUser): HiringScope => ({
  all: hasFullHiringAccess(user),
  employeeId: user.employeeId,
});

/** Actions the frontend offers to full access only: create a job, change its status, choose its recruiter. */
export function assertFullHiringAccess(user: AuthUser): void {
  if (!hasFullHiringAccess(user)) {
    throw forbidden('hiring.full_access_required', 'Only HR or the Talent Acquisition team can do this');
  }
}
