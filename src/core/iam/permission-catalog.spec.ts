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
