import { checkSalary, cleanLabel, fromMinor, sameLines, toMinor, totalsOf, type SalaryLine } from './salary.rules.js';

const line = (label: string, amount: string): SalaryLine => ({ label, minor: toMinor(amount) });

describe('salary amounts', () => {
  it('converts API amounts to whole fils / paise and back without float loss', () => {
    expect(toMinor('9000')).toBe(900000);
    expect(toMinor('9000.5')).toBe(900050);
    expect(toMinor('0.07')).toBe(7);
    expect(fromMinor(900050)).toBe('9000.50');
    expect(fromMinor(7)).toBe('0.07');
    expect(fromMinor(toMinor('999999999999.99'))).toBe('999999999999.99');
  });

  it('adds totals exactly (0.1 + 0.2 is 0.30)', () => {
    const t = totalsOf([line('A', '0.1'), line('B', '0.2')], [line('C', '0.05')]);
    expect(fromMinor(t.earnings)).toBe('0.30');
    expect(fromMinor(t.net)).toBe('0.25');
  });

  it('cleans labels', () => {
    expect(cleanLabel('  Basic   Salary ')).toBe('Basic Salary');
  });
});

describe('checkSalary', () => {
  it('accepts a normal structure, an empty one and zero amounts', () => {
    expect(checkSalary([line('Basic Salary', '9000'), line('Transportation Allowance', '0')], [])).toEqual([]);
    expect(checkSalary([], [])).toEqual([]);
  });

  it('refuses a missing or repeated label (case-insensitive, per list)', () => {
    const p = checkSalary([line('Basic', '1'), line('basic', '2'), line('', '3')], [line('Basic', '1')]);
    expect(p.map((x) => x.field)).toEqual(['earnings.1.label', 'earnings.2.label']);
  });

  it('refuses deductions above the earnings (net pay below zero)', () => {
    expect(checkSalary([line('Basic', '100')], [line('Advance', '100.01')])).toEqual([
      { field: 'deductions', message: 'Deductions cannot be more than the earnings' },
    ]);
    expect(checkSalary([line('Basic', '100')], [line('Advance', '100')])).toEqual([]);
  });

  it('refuses more than 20 lines and long labels', () => {
    const many = Array.from({ length: 21 }, (_, i) => line(`L${i}`, '1'));
    expect(checkSalary(many, []).map((x) => x.field)).toEqual(['earnings']);
    expect(checkSalary([line('x'.repeat(61), '1')], [])[0].field).toBe('earnings.0.label');
  });
});

describe('sameLines', () => {
  it('compares labels, amounts and order', () => {
    const a = [line('Basic', '1'), line('HRA', '2')];
    expect(sameLines(a, [line('Basic', '1.00'), line('HRA', '2')])).toBe(true);
    expect(sameLines(a, [line('HRA', '2'), line('Basic', '1')])).toBe(false);
    expect(sameLines(a, [line('Basic', '1')])).toBe(false);
  });
});
