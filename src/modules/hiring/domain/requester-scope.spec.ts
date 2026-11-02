import { AppError } from '../../../shared/errors/app-error.js';
import { allowedLocations, checkScopedRequest, type RequesterScope } from './requester-scope.js';

const scope: RequesterScope = {
  employeeId: 'me',
  ownLocationId: 'Dubai',
  departments: [
    { id: 'own', companyId: 'gsit', locationIds: ['Dubai'] },
    { id: 'headed', companyId: 'gss', locationIds: ['Dubai', 'Kochi'] },
  ],
};
const codeOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof AppError ? `${e.status} ${e.code}` : String(e);
  }
};

describe('BR-HIR-019 Team Lead requisition scope', () => {
  it('accepts their own department and departments they head, as hiring manager', () => {
    expect(
      codeOf(() =>
        checkScopedRequest(scope, { departmentId: 'own', locationId: 'Dubai', hiringManagerId: 'me' }, ['Dubai']),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        checkScopedRequest(scope, { departmentId: 'headed', locationId: 'Kochi', hiringManagerId: 'me' }, [
          'Dubai',
          'Kochi',
        ]),
      ),
    ).toBeNull();
  });

  it('refuses any other department', () => {
    expect(
      codeOf(() =>
        checkScopedRequest(scope, { departmentId: 'sales', locationId: 'Dubai', hiringManagerId: 'me' }, ['Dubai']),
      ),
    ).toBe('403 requisition.department_not_allowed');
  });

  it('keeps the location to where the department works', () => {
    expect(
      codeOf(() =>
        checkScopedRequest(scope, { departmentId: 'own', locationId: 'Kochi', hiringManagerId: 'me' }, ['Dubai']),
      ),
    ).toBe('400 requisition.location_not_allowed');
  });

  it('falls back to their own location when the department lists none', () => {
    expect(allowedLocations([], 'Dubai')).toEqual(['Dubai']);
    expect(
      codeOf(() => checkScopedRequest(scope, { departmentId: 'own', locationId: 'Dubai', hiringManagerId: 'me' }, [])),
    ).toBeNull();
    expect(
      codeOf(() => checkScopedRequest(scope, { departmentId: 'own', locationId: 'Kochi', hiringManagerId: 'me' }, [])),
    ).toBe('400 requisition.location_not_allowed');
  });

  it('makes them the hiring manager on a new requisition', () => {
    expect(
      codeOf(() =>
        checkScopedRequest(scope, { departmentId: 'own', locationId: 'Dubai', hiringManagerId: 'other' }, ['Dubai']),
      ),
    ).toBe('403 requisition.hiring_manager_fixed');
  });

  it('leaves a requisition HR raised for them in another department editable, but not movable', () => {
    const stored = { departmentId: 'sales', locationId: 'Dubai', hiringManagerId: 'me' };
    expect(codeOf(() => checkScopedRequest(scope, stored, ['Kochi'], stored))).toBeNull();
    expect(codeOf(() => checkScopedRequest(scope, { ...stored, locationId: 'Kochi' }, ['Kochi'], stored))).toBeNull();
    expect(codeOf(() => checkScopedRequest(scope, { ...stored, locationId: 'Abu Dhabi' }, ['Kochi'], stored))).toBe(
      '400 requisition.location_not_allowed',
    );
    expect(codeOf(() => checkScopedRequest(scope, { ...stored, departmentId: 'other-dept' }, ['Dubai'], stored))).toBe(
      '403 requisition.department_not_allowed',
    );
  });

  it('keeps the stored hiring manager on an edit', () => {
    const stored = { departmentId: 'own', locationId: 'Dubai', hiringManagerId: 'someone' };
    expect(codeOf(() => checkScopedRequest(scope, stored, ['Dubai'], stored))).toBeNull();
    expect(codeOf(() => checkScopedRequest(scope, { ...stored, hiringManagerId: 'me' }, ['Dubai'], stored))).toBe(
      '403 requisition.hiring_manager_fixed',
    );
  });
});
