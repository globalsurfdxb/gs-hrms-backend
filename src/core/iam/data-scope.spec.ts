import { employeeScopeOf, inEmployeeScope, type EmployeeScope } from './data-scope.js';
import { defaultGrants } from './permission-catalog.js';

const as = (role: string) => ({ employeeId: 'me', permissions: new Set(defaultGrants(role)) });

describe('employee data scope', () => {
  it.each([
    ['Super Admin', 'ALL'],
    ['HR', 'ALL'],
    ['Office Admin', 'ALL'],
    ['Talent Acquisition Manager', 'TEAM'],
    ['Team Lead', 'TEAM'],
    ['Recruiter', 'SELF'],
    ['Employee', 'SELF'],
  ])('%s sees %s by default', (role, kind) => {
    expect(employeeScopeOf(as(role)).kind).toBe(kind);
  });

  it('follows the grants, not the role name: a custom role with Team → Directory gets TEAM', () => {
    expect(employeeScopeOf({ employeeId: 'me', permissions: new Set(['employee:team:directory']) }).kind).toBe('TEAM');
    expect(employeeScopeOf({ employeeId: 'me', permissions: new Set() }).kind).toBe('SELF');
  });

  it('for editing needs the Edit grant: View alone is SELF', () => {
    const viewOnly = { employeeId: 'me', permissions: new Set(['employee:org:directory']) };
    expect(employeeScopeOf(viewOnly).kind).toBe('ALL');
    expect(employeeScopeOf(viewOnly, 'edit').kind).toBe('SELF');
  });

  it('TEAM covers self and direct reports, not a report’s reports', () => {
    const team: EmployeeScope = { kind: 'TEAM', employeeId: 'me' };
    expect(inEmployeeScope(team, { id: 'me', reportingManagerId: 'boss' })).toBe(true);
    expect(inEmployeeScope(team, { id: 'a', reportingManagerId: 'me' })).toBe(true);
    expect(inEmployeeScope(team, { id: 'b', reportingManagerId: 'a' })).toBe(false);
    expect(inEmployeeScope({ kind: 'SELF', employeeId: 'me' }, { id: 'a', reportingManagerId: 'me' })).toBe(false);
    expect(inEmployeeScope({ kind: 'ALL', employeeId: 'me' }, { id: 'b', reportingManagerId: 'a' })).toBe(true);
  });
});
