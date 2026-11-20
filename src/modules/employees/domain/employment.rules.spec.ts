import {
  checkPlacement,
  emergencyGroupAfterMove,
  seatingAfterMove,
  type Placement,
  type PlacementFacts,
} from './employment.rules.js';

const p: Placement = {
  employeeId: 'e1',
  locationId: 'Dubai',
  companyId: 'c1',
  departmentId: 'd1',
  designationId: 'g1',
  reportingManagerId: 'm1',
};
const facts: PlacementFacts = {
  location: { id: 'Dubai' },
  company: { id: 'c1', status: 'ACTIVE', locationId: null },
  department: { id: 'd1', companyId: 'c1', locationIds: ['Dubai'] },
  designation: { id: 'g1', departmentId: 'd1' },
  manager: { id: 'm1', status: 'ACTIVE', chain: ['m0'] },
};
const all = { organisation: true, companyChanged: true, manager: true };
const fields = (x: ReturnType<typeof checkPlacement>) => x.map((e) => e.field);

describe('checkPlacement', () => {
  it('accepts a consistent placement', () => {
    expect(checkPlacement(p, facts, all)).toEqual([]);
  });

  it('BR-EMP-002: the organization operates in the work location', () => {
    const f = { ...facts, company: { ...facts.company!, locationId: 'Kochi' } };
    expect(fields(checkPlacement(p, f, all))).toEqual(['companyId']);
  });

  it('BR-EMP-002: the department belongs to the organization and operates in the location', () => {
    expect(fields(checkPlacement(p, { ...facts, department: { ...facts.department!, companyId: 'c2' } }, all))).toEqual(
      ['departmentId'],
    );
    expect(
      fields(checkPlacement(p, { ...facts, department: { ...facts.department!, locationIds: ['Kochi'] } }, all)),
    ).toEqual(['departmentId']);
  });

  it('the designation belongs to the department, and needs one', () => {
    expect(fields(checkPlacement(p, { ...facts, designation: { id: 'g1', departmentId: 'd2' } }, all))).toEqual([
      'designationId',
    ]);
    expect(fields(checkPlacement({ ...p, departmentId: null }, facts, all))).toEqual(['designationId']);
  });

  it('rejects ids that do not exist and a newly chosen inactive organization', () => {
    const none = { location: null, company: null, department: null, designation: null, manager: null };
    expect(fields(checkPlacement(p, none, all))).toEqual([
      'locationId',
      'companyId',
      'departmentId',
      'designationId',
      'reportingManagerId',
    ]);
    const inactive = { ...facts, company: { ...facts.company!, status: 'INACTIVE' as const } };
    expect(fields(checkPlacement(p, inactive, all))).toEqual(['companyId']);
    expect(checkPlacement(p, inactive, { ...all, companyChanged: false })).toEqual([]);
  });

  it('BR-EMP-003: no self-reporting, no cycles, no inactive manager', () => {
    expect(
      fields(
        checkPlacement(
          { ...p, reportingManagerId: 'e1' },
          { ...facts, manager: { id: 'e1', status: 'ACTIVE', chain: [] } },
          all,
        ),
      ),
    ).toEqual(['reportingManagerId']);
    expect(
      fields(checkPlacement(p, { ...facts, manager: { id: 'm1', status: 'ACTIVE', chain: ['x', 'e1'] } }, all)),
    ).toEqual(['reportingManagerId']);
    expect(fields(checkPlacement(p, { ...facts, manager: { id: 'm1', status: 'INACTIVE', chain: [] } }, all))).toEqual([
      'reportingManagerId',
    ]);
    expect(checkPlacement({ ...p, reportingManagerId: null }, { ...facts, manager: null }, all)).toEqual([]);
  });

  it('only re-checks the parts that changed', () => {
    const broken = { ...facts, company: null, manager: null };
    expect(checkPlacement(p, broken, { organisation: false, companyChanged: false, manager: false })).toEqual([]);
  });
});

describe('location moves (BR-EMP-001, BR-EMP-010)', () => {
  it('switches emergency contact groups between templates', () => {
    expect(emergencyGroupAfterMove('Local Emergency Contact (UAE)', 'INDIA')).toBe('Primary Emergency Contact');
    expect(emergencyGroupAfterMove('Home Country Emergency Contact', 'INDIA')).toBe('Alternate Emergency Contact');
    expect(emergencyGroupAfterMove('Primary Emergency Contact', 'UAE')).toBe('Local Emergency Contact (UAE)');
    expect(emergencyGroupAfterMove('Primary Emergency Contact', 'INDIA')).toBe('Primary Emergency Contact');
  });

  it('keeps a seating location only if the new location has it', () => {
    expect(seatingAfterMove('Floor 3', ['Floor 3', 'Floor 4'])).toBe('Floor 3');
    expect(seatingAfterMove('Floor 3', ['Ground'])).toBeNull();
    expect(seatingAfterMove(null, ['Ground'])).toBeNull();
  });
});
