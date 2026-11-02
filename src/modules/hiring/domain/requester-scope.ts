import { AppError, forbidden } from '../../../shared/errors/app-error.js';

/* BR-HIR-019 — a Team Lead asks for headcount only for their own team (gs-hrms components/hiring/HiringForms.tsx
   RequisitionDrawer + lib/hiringAccess.ts teamLeadScope, `62f2297`). Applies to everyone without full hiring access
   (Q22: decided by permission, so Office Admin and custom roles follow the same rule). Pure: callers pass in the
   departments and locations from the organisation set-up. */

/** A department the requester may ask for: their own (first) and those they head. */
export interface ScopedDepartment {
  id: string;
  companyId: string;
  /** Locations the department works in. */
  locationIds: string[];
}

export interface RequesterScope {
  employeeId: string;
  /** The requester's own location: used when a department lists no location. */
  ownLocationId: string;
  departments: ScopedDepartment[];
}

/** Where the headcount is and who manages it. */
export interface RequestPlace {
  departmentId: string;
  locationId: string;
  hiringManagerId: string;
}

/** Locations a requisition in this department may be based in. A department with none set up falls back to the
    requester's own location, as the frontend does. */
export const allowedLocations = (deptLocationIds: readonly string[], ownLocationId: string): string[] =>
  deptLocationIds.length ? [...deptLocationIds] : [ownLocationId];

/**
 * BR-HIR-019. `deptLocationIds` are the chosen department's locations; `before` is the stored requisition on an edit.
 * On an edit only what changes is checked, so a requisition HR raised for them in another department stays editable
 * (the frontend keeps that department choosable).
 */
export function checkScopedRequest(
  scope: RequesterScope,
  next: RequestPlace,
  deptLocationIds: readonly string[],
  before?: RequestPlace,
): void {
  const deptChanged = !before || next.departmentId !== before.departmentId;
  if (deptChanged && !scope.departments.some((d) => d.id === next.departmentId)) {
    throw forbidden(
      'requisition.department_not_allowed',
      'You can ask for headcount only for your own department or a department you head',
    );
  }
  const placeChanged = deptChanged || next.locationId !== before?.locationId;
  if (placeChanged && !allowedLocations(deptLocationIds, scope.ownLocationId).includes(next.locationId)) {
    throw new AppError('requisition.location_not_allowed', 'Choose a location the department works in');
  }
  const manager = before ? before.hiringManagerId : scope.employeeId;
  if (next.hiringManagerId !== manager) {
    throw forbidden(
      'requisition.hiring_manager_fixed',
      before
        ? 'Only HR can change the hiring manager'
        : 'You are the hiring manager for headcount you ask for; HR can raise it for someone else',
    );
  }
}
