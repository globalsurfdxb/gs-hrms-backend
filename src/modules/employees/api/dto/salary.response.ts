import { ApiProperty } from '@nestjs/swagger';
import { fromMinor, totalsOf, type SalaryLine } from '../../domain/salary.rules.js';

export class SalaryLineResponse {
  @ApiProperty({ example: 'Basic Salary' }) label: string;
  @ApiProperty({ example: '9000.00', description: 'Decimal as a string — never a float' }) amount: string;
}

export interface SalaryView {
  employeeCode: string;
  template: 'UAE' | 'INDIA';
  currency: 'AED' | 'INR';
  earnings: readonly SalaryLine[];
  deductions: readonly SalaryLine[];
  canEdit: boolean;
}

/* Salary structure of one employee. Only for callers with Salary → View in scope, or the person themselves. */
export class SalaryResponse {
  @ApiProperty({ example: 'GS-087' }) employeeCode: string;
  @ApiProperty({ enum: ['UAE', 'INDIA'], description: 'Which default components apply' }) template: 'UAE' | 'INDIA';
  @ApiProperty({ enum: ['AED', 'INR'], description: 'Set by the work location' }) currency: 'AED' | 'INR';
  @ApiProperty({ type: [SalaryLineResponse] }) earnings: SalaryLineResponse[];
  @ApiProperty({ type: [SalaryLineResponse] }) deductions: SalaryLineResponse[];
  @ApiProperty({ example: '12000.00', description: 'Sum of the earnings' }) totalEarnings: string;
  @ApiProperty({ example: '0.00', description: 'Sum of the deductions' }) totalDeductions: string;
  @ApiProperty({ example: '12000.00', description: 'Earnings minus deductions' }) netPay: string;
  @ApiProperty({ description: 'Whether you may change this salary' }) canEdit: boolean;

  static from(v: SalaryView): SalaryResponse {
    const line = (l: SalaryLine): SalaryLineResponse => ({ label: l.label, amount: fromMinor(l.minor) });
    const t = totalsOf(v.earnings, v.deductions);
    const r = new SalaryResponse();
    r.employeeCode = v.employeeCode;
    r.template = v.template;
    r.currency = v.currency;
    r.earnings = v.earnings.map(line);
    r.deductions = v.deductions.map(line);
    r.totalEarnings = fromMinor(t.earnings);
    r.totalDeductions = fromMinor(t.deductions);
    r.netPay = fromMinor(t.net);
    r.canEdit = v.canEdit;
    return r;
  }
}
