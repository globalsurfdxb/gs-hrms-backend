/* CSV export helpers. Every export goes through `toCsv` so cells that start with = + - @ (or tab/CR) cannot run as
   spreadsheet formulas when HR opens the file in Excel (CSV/formula injection). */

const FORMULA_START = /^[=+\-@\t\r]/;

export function safeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(safeCsvCell).join(',')).join('\r\n');
}
