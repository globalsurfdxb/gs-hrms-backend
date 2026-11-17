/* Employment record rules (spec docs/modules/employees.md). Pure — no Nest, no Prisma. */
import { EMERGENCY_GROUPS, type LocationTemplate, type ProfileProblem } from './profile.rules.js';

/** The placement an edit would leave the employee in (after applying the change to the current record). */
export interface Placement {
  employeeId: string;
  locationId: string;
  companyId: string;
  departmentId: string | null;
  designationId: string | null;
  reportingManagerId: string | null;
}

/** What the database says about the ids in the placement. null = no such record. */
export interface PlacementFacts {
  location: { id: string } | null;
  company: { id: string; status: 'ACTIVE' | 'INACTIVE'; locationId: string | null } | null;
  department: { id: string; companyId: string; locationIds: string[] } | null;
  designation: { id: string; departmentId: string } | null;
  /** `chain` = the ids above the manager, nearest first (their manager, that person's manager, …). */
  manager: { id: string; status: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'INACTIVE'; chain: string[] } | null;
}

/** Which parts of the placement the edit touches; untouched parts are not re-checked, so old data never blocks a save. */
export interface PlacementChange {
  organisation: boolean;
  companyChanged: boolean;
  manager: boolean;
}

export function checkPlacement(p: Placement, facts: PlacementFacts, change: PlacementChange): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  const add = (field: string, message: string) => out.push({ field, message });

  if (change.organisation) {
    if (!facts.location) add('locationId', 'Work location does not exist');
    const c = facts.company;
    if (!c) add('companyId', 'Organization does not exist');
    else {
      if (change.companyChanged && c.status === 'INACTIVE') add('companyId', 'Organization is inactive');
      // BR-EMP-002: the organization operates in the location (null = every location).
      if (c.locationId && c.locationId !== p.locationId)
        add('companyId', 'Organization does not operate in this work location');
    }
    if (p.departmentId) {
      const d = facts.department;
      if (!d) add('departmentId', 'Department does not exist');
      else if (d.companyId !== p.companyId) add('departmentId', 'Department belongs to another organization');
      else if (!d.locationIds.includes(p.locationId))
        add('departmentId', 'Department does not operate in this work location');
    }
    if (p.designationId) {
      const g = facts.designation;
      if (!p.departmentId) add('designationId', 'Choose a department before a designation');
      else if (!g) add('designationId', 'Designation does not exist');
      else if (g.departmentId !== p.departmentId) add('designationId', 'Designation belongs to another department');
    }
  }

  if (change.manager && p.reportingManagerId) {
    const m = facts.manager;
    if (!m) add('reportingManagerId', 'Reporting manager does not exist');
    else if (m.id === p.employeeId) add('reportingManagerId', 'An employee cannot report to themselves');
    // BR-EMP-003: no cycles — the new manager must not sit below the employee.
    else if (m.chain.includes(p.employeeId))
      add('reportingManagerId', 'Reporting manager reports to this employee (directly or indirectly)');
    else if (m.status === 'INACTIVE') add('reportingManagerId', 'Reporting manager is inactive');
  }
  return out;
}

/** BR-EMP-001 / BR-EMP-010: moving between templates switches each emergency contact to the matching group. */
export function emergencyGroupAfterMove(group: string, to: LocationTemplate): string {
  const from: LocationTemplate = to === 'UAE' ? 'INDIA' : 'UAE';
  const i = EMERGENCY_GROUPS[from].indexOf(group);
  return i === -1 ? group : EMERGENCY_GROUPS[to][i]!;
}

/** BR-EMP-001: a seating location only survives a move if the new location has it. */
export const seatingAfterMove = (seat: string | null, seating: readonly string[]): string | null =>
  seat && seating.includes(seat) ? seat : null;
