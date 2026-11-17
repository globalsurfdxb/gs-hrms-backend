import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { forbidden } from '../../../shared/errors/app-error.js';

/* Who may edit employee records: Directory → Edit in Organization or Operations (Super Admin, HR, Office Admin by
   default). Team → Directory → Edit does not edit records — the frontend sends team leads to change requests
   (lib/guard.ts). Decided by permission, never by role name. */
export const canEditEmployees = (user: Pick<AuthUser, 'permissions'>): boolean =>
  hasPermission(user.permissions, PERMISSIONS.employee.orgDirectory, 'edit') ||
  hasPermission(user.permissions, PERMISSIONS.employee.opsDirectory, 'edit');

export function assertCanEditEmployees(user: Pick<AuthUser, 'permissions'>): void {
  if (!canEditEmployees(user)) {
    throw forbidden('employee.edit_not_allowed', 'Only HR and administrators can edit employee records');
  }
}
