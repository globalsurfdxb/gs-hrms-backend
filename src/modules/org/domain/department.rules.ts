import { AppError } from '../../../shared/errors/app-error.js';

/* Pure business rules for departments and designations — no Nest, no Prisma. Unit-tested in
   department.rules.spec.ts. Rule ids refer to docs/modules/org.md. */

export interface DepartmentUsage {
  employees: number;
  requisitions: number;
  /** References to the department's designations, which a department delete would remove too. */
  designationEmployees: number;
  designationRequisitions: number;
  designationJobs: number;
}

export interface DesignationUsage {
  employees: number;
  requisitions: number;
  jobs: number;
}

/** BR-ORG-013: at least one location; each must exist and be one the company operates in (a company with no
    location — "Both" — operates in every location). Returns the ids without duplicates, in the order given. */
export function checkDepartmentLocations(
  locationIds: string[],
  known: readonly string[],
  companyLocationId: string | null,
): string[] {
  const ids = [...new Set(locationIds)];
  if (ids.length === 0) throw new AppError('department.location_required', 'Choose at least one work location');
  const unknown = ids.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    throw new AppError('department.unknown_location', `Unknown location ${unknown.map((id) => `"${id}"`).join(', ')}`);
  }
  if (companyLocationId && ids.some((id) => id !== companyLocationId)) {
    throw new AppError(
      'department.location_outside_company',
      `The company operates only in ${companyLocationId}, so its departments can only be there`,
    );
  }
  return ids;
}

/** BR-ORG-014: the head is an employee of the department's company who has not left. */
export function assertHeadEligible(
  head: { companyId: string; employmentStatus: string } | null,
  companyId: string,
): void {
  if (!head || head.companyId !== companyId || head.employmentStatus === 'INACTIVE') {
    throw new AppError('department.invalid_head', 'The head must be a current employee of the same company');
  }
}

/** BR-ORG-016: a department or designation still referenced cannot be deleted. The database would otherwise
    silently clear the reference on employees and hiring records (ON DELETE SET NULL). */
export function assertDepartmentDeletable(usage: DepartmentUsage): void {
  throwIfUsed('department', usage);
}

export function assertDesignationDeletable(usage: DesignationUsage): void {
  throwIfUsed('designation', usage);
}

/** BR-ORG-017: a location cannot be removed from a department while current employees of the department work
    there — their placement would break BR-ORG-006. `staffByLocation` counts them per removed location. */
export function assertLocationsRemovable(staffByLocation: Record<string, number>): void {
  const used = Object.entries(staffByLocation).filter(([, n]) => n > 0);
  if (used.length > 0) {
    throw new AppError(
      'department.location_in_use',
      `Employees of this department work in ${used.map(([id, n]) => `${id} (${n})`).join(', ')}. Move them first.`,
      409,
      { staffByLocation: Object.fromEntries(used) },
    );
  }
}

function throwIfUsed(entity: 'department' | 'designation', usage: object): void {
  if (Object.values(usage).some((n) => n > 0)) {
    throw new AppError(
      `${entity}.in_use`,
      `This ${entity} is still used by employees or hiring records. Move them first.`,
      409,
      { usage },
    );
  }
}
