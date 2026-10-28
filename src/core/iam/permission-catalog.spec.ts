import { readFileSync } from 'node:fs';
import { SYSTEM_ROLES } from './feature-catalog.js';
import { allFeatures, defaultGrants, hasPermission, PERMISSIONS } from './permission-catalog.js';

/* The backend catalogue must produce exactly the frontend's keys, or screens disappear (or appear) when the
   frontend switches `can()` to `/api/auth/me` permissions. Snapshot: test/fixtures/README.md. */
const frontend = JSON.parse(readFileSync('test/fixtures/frontend-permissions.json', 'utf8')) as {
  features: string[];
  grants: Record<string, string[]>;
};

describe('catalogue matches the frontend', () => {
  it('has the same feature ids', () => {
    expect([...allFeatures()].sort()).toEqual(frontend.features);
  });

  it.each(SYSTEM_ROLES)('gives %s the same default grants', (role) => {
    expect([...defaultGrants(role)].sort()).toEqual(frontend.grants[role]);
  });

  it('only checks features that exist in the catalogue', () => {
    const ids = new Set(allFeatures());
    const used = Object.values(PERMISSIONS).flatMap((group) => Object.values(group) as string[]);
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });
});

const companies = PERMISSIONS.administration.companies;

describe('hasPermission', () => {
  it('requires View for any other action', () => {
    expect(hasPermission(new Set([`${companies}#add`]), companies, 'add')).toBe(false);
    expect(hasPermission(new Set([companies, `${companies}#add`]), companies, 'add')).toBe(true);
  });

  it('does not treat View as Edit', () => {
    expect(hasPermission(new Set([companies]), companies, 'edit')).toBe(false);
  });
});

describe('defaultGrants', () => {
  it('gives Super Admin delete', () => {
    expect(hasPermission(new Set(defaultGrants('Super Admin')), companies, 'delete')).toBe(true);
  });

  it('gives HR edit but not delete in Administration', () => {
    const hr = new Set(defaultGrants('HR'));
    expect(hasPermission(hr, companies, 'edit')).toBe(true);
    expect(hasPermission(hr, companies, 'delete')).toBe(false);
  });

  it('gives Employee no administration access', () => {
    expect(defaultGrants('Employee').some((k) => k.startsWith('administration:'))).toBe(false);
  });

  it('gives a custom role nothing by default', () => {
    expect(defaultGrants('Payroll Clerk')).toEqual([]);
  });

  it('grants Audit Logs as View only, even to Super Admin (read-only screen)', () => {
    const audit = PERMISSIONS.administration.audit;
    for (const role of ['Super Admin', 'HR', 'Office Admin']) {
      const g = new Set(defaultGrants(role));
      expect(hasPermission(g, audit, 'view')).toBe(true);
      expect(hasPermission(g, audit, 'edit')).toBe(false);
    }
  });
});

describe('defaultGrants — hiring', () => {
  const { requisitions, requisitionApprovals, jobs, candidates, offers, reports } = PERMISSIONS.hiring;

  it('gives Super Admin and HR full hiring access', () => {
    for (const role of ['Super Admin', 'HR']) {
      const g = new Set(defaultGrants(role));
      for (const f of [requisitions, requisitionApprovals, jobs, candidates, offers]) {
        expect(hasPermission(g, f, 'delete')).toBe(true);
      }
      expect(hasPermission(g, reports)).toBe(true);
    }
  });

  it('keeps hiring reports view-only', () => {
    expect(hasPermission(new Set(defaultGrants('Super Admin')), reports, 'add')).toBe(false);
  });

  it('lets Team Lead and Office Admin raise requisitions but not recruit', () => {
    for (const role of ['Team Lead', 'Office Admin']) {
      const g = new Set(defaultGrants(role));
      expect(hasPermission(g, requisitions, 'add')).toBe(true);
      expect(hasPermission(g, requisitionApprovals, 'edit')).toBe(true);
      expect(hasPermission(g, requisitions, 'delete')).toBe(false);
      expect(hasPermission(g, jobs)).toBe(false);
      expect(hasPermission(g, candidates)).toBe(false);
      expect(hasPermission(g, reports)).toBe(false);
    }
  });

  it('gives Employee no hiring access', () => {
    expect(defaultGrants('Employee').some((k) => k.startsWith('hiring:'))).toBe(false);
  });
});
