/* Which employees a caller may see, resolved from their permissions (never from the role name, so custom roles follow
   their grants). Repositories take a scope and filter in the query itself — never fetch everything and filter in
   memory or in the controller. Same rule as the frontend directory (lib/guard.ts, DirectoryView):

     ALL  — Directory → View in Organization or Operations (Super Admin, HR, Office Admin by default)
     TEAM — Team → Directory: self + direct reports only, not the whole tree (Team Lead, TA Manager by default)
     SELF — everyone else: own record only (Recruiter, Employee by default)

   Office Admin's "own location" in the frontend (`defaultScope`, lib/data.ts) is only the starting value of a location
   filter they can change, so it is not a restriction here. Pure file — no Nest or Prisma imports. */

import type { AuthUser } from '../auth/auth-user.js';
import { hasPermission, PERMISSIONS } from './permission-catalog.js';

const { orgDirectory, opsDirectory, teamDirectory } = PERMISSIONS.employee;

export type DataScope = 'ALL' | 'TEAM' | 'SELF';

export interface EmployeeScope {
  kind: DataScope;
  /** The caller: always in their own scope. */
  employeeId: string;
}

/** The scope for `action` on employee records: View for reading, Edit for changing. */
export function employeeScopeOf(
  user: Pick<AuthUser, 'employeeId' | 'permissions'>,
  action: 'view' | 'edit' = 'view',
): EmployeeScope {
  const p = user.permissions;
  const everyone = hasPermission(p, orgDirectory, action) || hasPermission(p, opsDirectory, action);
  if (everyone) return { kind: 'ALL', employeeId: user.employeeId };
  if (hasPermission(p, teamDirectory, action)) return { kind: 'TEAM', employeeId: user.employeeId };
  return { kind: 'SELF', employeeId: user.employeeId };
}

/** The same rule for one record already loaded (domain checks and tests). */
export const inEmployeeScope = (scope: EmployeeScope, e: { id: string; reportingManagerId: string | null }): boolean =>
  scope.kind === 'ALL' ||
  e.id === scope.employeeId ||
  (scope.kind === 'TEAM' && e.reportingManagerId === scope.employeeId);
