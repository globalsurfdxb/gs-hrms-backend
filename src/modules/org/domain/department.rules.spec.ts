import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertDepartmentDeletable,
  assertDesignationDeletable,
  assertHeadEligible,
  assertLocationsRemovable,
  checkDepartmentLocations,
} from './department.rules.js';

const KNOWN = ['Dubai', 'Kochi'];
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not-an-app-error';
  }
  return undefined;
};

describe('BR-ORG-013 checkDepartmentLocations', () => {
  it('accepts known locations and drops duplicates', () => {
    expect(checkDepartmentLocations(['Kochi', 'Dubai', 'Kochi'], KNOWN, null)).toEqual(['Kochi', 'Dubai']);
  });

  it('requires at least one location', () => {
    expect(codeOf(() => checkDepartmentLocations([], KNOWN, null))).toBe('department.location_required');
  });

  it('rejects an unknown location', () => {
    expect(codeOf(() => checkDepartmentLocations(['Dubai', 'Mars'], KNOWN, null))).toBe('department.unknown_location');
  });

  it('keeps a single-location company to its own location', () => {
    expect(checkDepartmentLocations(['Dubai'], KNOWN, 'Dubai')).toEqual(['Dubai']);
    expect(codeOf(() => checkDepartmentLocations(['Dubai', 'Kochi'], KNOWN, 'Dubai'))).toBe(
      'department.location_outside_company',
    );
  });
});

describe('BR-ORG-014 assertHeadEligible', () => {
  it('accepts a current employee of the same company', () => {
    expect(() => assertHeadEligible({ companyId: 'co', employmentStatus: 'ACTIVE' }, 'co')).not.toThrow();
  });

  it.each([
    ['missing', null],
    ['other company', { companyId: 'other', employmentStatus: 'ACTIVE' }],
    ['left', { companyId: 'co', employmentStatus: 'INACTIVE' }],
  ])('rejects a head who is %s', (_, head) => {
    expect(codeOf(() => assertHeadEligible(head, 'co'))).toBe('department.invalid_head');
  });
});

describe('BR-ORG-016 delete only when unused', () => {
  const noDept = {
    employees: 0,
    requisitions: 0,
    designationEmployees: 0,
    designationRequisitions: 0,
    designationJobs: 0,
  };
  const noDes = { employees: 0, requisitions: 0, jobs: 0 };

  it('allows unused records', () => {
    expect(() => assertDepartmentDeletable(noDept)).not.toThrow();
    expect(() => assertDesignationDeletable(noDes)).not.toThrow();
  });

  it('refuses a department whose designation is still used, and reports the usage', () => {
    const usage = { ...noDept, designationJobs: 1 };
    expect(() => assertDepartmentDeletable(usage)).toThrow(
      expect.objectContaining({ code: 'department.in_use', status: 409, details: { usage } }),
    );
  });

  it('refuses a designation still held by an employee', () => {
    expect(codeOf(() => assertDesignationDeletable({ ...noDes, employees: 2 }))).toBe('designation.in_use');
  });
});

describe('BR-ORG-017 assertLocationsRemovable', () => {
  it('allows removing locations nobody in the department works in', () => {
    expect(() => assertLocationsRemovable({ Kochi: 0 })).not.toThrow();
  });

  it('refuses and lists the locations still staffed', () => {
    expect(() => assertLocationsRemovable({ Dubai: 3, Kochi: 0 })).toThrow(
      expect.objectContaining({ code: 'department.location_in_use', details: { staffByLocation: { Dubai: 3 } } }),
    );
  });
});
