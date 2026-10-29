import { AppError } from '../../shared/errors/app-error.js';
import {
  assertCanAssign,
  assertCanGrant,
  assertGrantsEditable,
  assertNotOwnRole,
  assertRoleDeletable,
  assertRoleRenamable,
  checkGrants,
  diffGrants,
  normaliseRoleName,
} from './role.rules.js';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not-an-app-error';
  }
  return undefined;
};

const companies = 'administration:admin-companies';
const audit = 'administration:admin-audit';

describe('BR-IAM-001 normaliseRoleName', () => {
  it('trims and collapses spaces', () => {
    expect(normaliseRoleName('  Payroll   Clerk ')).toBe('Payroll Clerk');
  });

  it.each(['', 'x', 'y'.repeat(61)])('rejects %j', (v) => {
    expect(codeOf(() => normaliseRoleName(v))).toBe('role.invalid_name');
  });
});

describe('BR-IAM-002 checkGrants', () => {
  it('sorts and removes duplicates', () => {
    expect(checkGrants([`${companies}#edit`, companies, companies])).toEqual([companies, `${companies}#edit`]);
  });

  it.each([
    ['an unknown feature', 'nope:nothing'],
    ['an unknown action', `${companies}#approve`],
    ['an action a read-only screen does not have', `${audit}#edit`],
    ['a malformed key', `${companies}#edit#delete`],
  ])('rejects %s', (_, key) => {
    expect(codeOf(() => checkGrants([companies, audit, key]))).toBe('role.unknown_permission');
  });

  it('requires View with Add/Edit/Delete', () => {
    expect(codeOf(() => checkGrants([`${companies}#delete`]))).toBe('role.permission_without_view');
  });
});

describe('diffGrants', () => {
  it('lists what was granted and revoked', () => {
    expect(diffGrants(['a', 'b'], ['b', 'c'])).toEqual({ granted: ['c'], revoked: ['a'] });
  });
});

describe('BR-IAM-003 assertNotOwnRole', () => {
  it('refuses changes to your own role', () => {
    expect(codeOf(() => assertNotOwnRole('r1', 'r1'))).toBe('role.own_role');
    expect(() => assertNotOwnRole('r1', 'r2')).not.toThrow();
  });
});

describe('BR-IAM-004 assertCanGrant', () => {
  it('allows granting what you hold, refuses the rest', () => {
    const mine = new Set([companies]);
    expect(() => assertCanGrant(mine, [companies])).not.toThrow();
    expect(() => assertCanGrant(mine, [companies, audit])).toThrow(
      expect.objectContaining({ code: 'role.grant_exceeds_own', status: 403, details: { missing: [audit] } }),
    );
  });
});

describe('BR-IAM-005 assertGrantsEditable', () => {
  it('fixes the Super Admin system role only', () => {
    expect(codeOf(() => assertGrantsEditable({ name: 'Super Admin', system: true }))).toBe('role.super_admin_fixed');
    expect(() => assertGrantsEditable({ name: 'HR', system: true })).not.toThrow();
    expect(() => assertGrantsEditable({ name: 'Super Admin', system: false })).not.toThrow();
  });
});

describe('BR-IAM-006 assertCanAssign', () => {
  const mine = new Set([companies, audit]);

  it('allows moving between roles within your own permissions', () => {
    expect(() => assertCanAssign(mine, [companies], [audit])).not.toThrow();
  });

  it('refuses giving a stronger role, or changing someone stronger', () => {
    expect(codeOf(() => assertCanAssign(mine, [], ['payroll:self:my-payslips']))).toBe('role.assign_exceeds_own');
    expect(codeOf(() => assertCanAssign(mine, ['payroll:self:my-payslips'], []))).toBe('role.assign_exceeds_own');
  });
});

describe('BR-IAM-007 system roles and members', () => {
  it('never renames or deletes a system role', () => {
    expect(codeOf(() => assertRoleRenamable({ system: true, name: 'HR' }, 'People'))).toBe('role.system');
    expect(() => assertRoleRenamable({ system: true, name: 'HR' }, 'HR')).not.toThrow();
    expect(codeOf(() => assertRoleDeletable({ system: true }, 0))).toBe('role.system');
  });

  it('refuses deleting a role someone still has', () => {
    expect(codeOf(() => assertRoleDeletable({ system: false }, 2))).toBe('role.in_use');
    expect(() => assertRoleDeletable({ system: false }, 0)).not.toThrow();
  });
});
