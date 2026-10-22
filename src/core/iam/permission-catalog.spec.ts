import { defaultGrants, hasPermission, PERMISSIONS } from './permission-catalog.js';

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
    expect(defaultGrants('Employee')).toEqual([]);
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
