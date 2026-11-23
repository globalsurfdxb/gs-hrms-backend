/* Salary structure rules (spec docs/modules/employees.md). Pure: amounts are handled in fils / paise (whole numbers)
   so totals never suffer float rounding. The currency follows the work location (CURRENCY in identity-bank.rules). */

export type SalaryKind = 'EARNING' | 'DEDUCTION';
export interface SalaryLine {
  label: string;
  /** Hundredths of the currency unit (fils / paise). */
  minor: number;
}
export interface SalaryProblem {
  field: string;
  message: string;
}

export const MAX_LINES = 20;
export const LABEL_MAX = 60;
/** Up to 12 digits and 2 decimals, as the API sends money ("9000", "9000.5", "9000.50"). */
export const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** Default components the forms start from (frontend onboarding). */
export const DEFAULT_COMPONENTS = {
  UAE: { earnings: ['Basic Salary', 'Transportation Allowance', 'Accommodation Allowance'], deductions: [] },
  INDIA: { earnings: ['Basic', 'HRA', 'Fixed Allowance', 'Other Allowance'], deductions: ['Advance', 'EPF', 'Other'] },
} as const;

/** "9000.5" → 900050. Call only with a string that matches AMOUNT. */
export const toMinor = (amount: string): number => {
  const [whole, frac = ''] = amount.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
};
/** 900050 → "9000.50" (the API's money format). */
export const fromMinor = (minor: number): string =>
  `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

/** Spaces trimmed and collapsed, so "Basic  Salary " and "Basic Salary" are one label. */
export const cleanLabel = (label: string) => label.trim().replace(/\s+/g, ' ');

export const total = (lines: readonly SalaryLine[]) => lines.reduce((n, l) => n + l.minor, 0);

export interface SalaryTotals {
  earnings: number;
  deductions: number;
  net: number;
}
export const totalsOf = (earnings: readonly SalaryLine[], deductions: readonly SalaryLine[]): SalaryTotals => {
  const e = total(earnings);
  const d = total(deductions);
  return { earnings: e, deductions: d, net: e - d };
};

/** Problems with a whole structure about to be saved (labels already cleaned). Empty = valid. */
export function checkSalary(earnings: readonly SalaryLine[], deductions: readonly SalaryLine[]): SalaryProblem[] {
  const out: SalaryProblem[] = [];
  const list = (key: 'earnings' | 'deductions', lines: readonly SalaryLine[], name: string) => {
    if (lines.length > MAX_LINES) out.push({ field: key, message: `At most ${MAX_LINES} ${name}` });
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!l.label) out.push({ field: `${key}.${i}.label`, message: `Each ${name.slice(0, -1)} needs a name` });
      else if (l.label.length > LABEL_MAX) {
        out.push({ field: `${key}.${i}.label`, message: `“${l.label.slice(0, 20)}…” is longer than ${LABEL_MAX}` });
      } else {
        const k = l.label.toLowerCase();
        if (seen.has(k)) out.push({ field: `${key}.${i}.label`, message: `“${l.label}” is listed twice in ${name}` });
        seen.add(k);
      }
    });
  };
  list('earnings', earnings, 'earnings');
  list('deductions', deductions, 'deductions');
  const t = totalsOf(earnings, deductions);
  if (t.net < 0) out.push({ field: 'deductions', message: 'Deductions cannot be more than the earnings' });
  return out;
}

/** Same lines in the same order. */
export const sameLines = (a: readonly SalaryLine[], b: readonly SalaryLine[]) =>
  a.length === b.length && a.every((l, i) => l.label === b[i].label && l.minor === b[i].minor);
