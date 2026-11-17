import { defaultGrants } from '../../../core/iam/permission-catalog.js';
import { canEditEmployees } from './employee-access.js';

describe('who may edit employee records', () => {
  it.each([
    ['Super Admin', true],
    ['HR', true],
    ['Office Admin', true],
    ['Talent Acquisition Manager', false],
    ['Team Lead', false],
    ['Recruiter', false],
    ['Employee', false],
  ])('%s: %s', (role, allowed) => {
    expect(canEditEmployees({ permissions: new Set(defaultGrants(role)) })).toBe(allowed);
  });

  it('follows the grant, not the role name', () => {
    expect(canEditEmployees({ permissions: new Set(['employee:ops:directory', 'employee:ops:directory#edit']) })).toBe(
      true,
    );
    expect(
      canEditEmployees({ permissions: new Set(['employee:team:directory', 'employee:team:directory#edit']) }),
    ).toBe(false);
  });
});
