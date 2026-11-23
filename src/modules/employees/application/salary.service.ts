import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { employeeScopeOf, inEmployeeScope, type EmployeeScope } from '../../../core/iam/data-scope.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, forbidden, notFound } from '../../../shared/errors/app-error.js';
import { SalaryResponse } from '../api/dto/salary.response.js';
import type { SalaryLineDto, UpdateSalaryDto } from '../api/dto/update-salary.dto.js';
import { CURRENCY } from '../domain/identity-bank.rules.js';
import { checkSalary, cleanLabel, sameLines, toMinor, type SalaryLine } from '../domain/salary.rules.js';
import { SalaryRepository, type SalaryRecord } from '../infrastructure/salary.repository.js';

const { salary } = PERMISSIONS.employee;

/* Salary structure (spec docs/modules/employees.md). Access is decided by permission:
     read — Salary → View, within the caller's directory scope; anyone may read their own
     edit — Salary → Edit, within the caller's Directory → Edit scope, and never one's own salary
   Not encrypted (decided 2026-10-23, hiring.md Q8). Amounts never reach the audit log or the logs; views of someone
   else's salary are audited. */
@Injectable()
export class SalaryService {
  constructor(private readonly repo: SalaryRepository) {}

  async get(employeeCode: string, user: AuthUser): Promise<SalaryResponse> {
    const r = await this.find(employeeCode, readScope(user));
    if (r.id !== user.employeeId && (r.earnings.length || r.deductions.length)) {
      await this.repo.recordView(r.id, actorOf(user));
    }
    return this.view(r, user);
  }

  async replace(employeeCode: string, dto: UpdateSalaryDto, user: AuthUser): Promise<SalaryResponse> {
    if (!hasPermission(user.permissions, salary, 'edit')) {
      throw forbidden('employee.salary_edit_not_allowed', 'You may not change salaries');
    }
    const r = await this.find(employeeCode, employeeScopeOf(user, 'edit'));
    // Nobody sets their own pay; another HR or Super Admin does it.
    if (r.id === user.employeeId) {
      throw forbidden('employee.salary_own_edit_not_allowed', 'You may not change your own salary');
    }
    const lines = (rows: SalaryLineDto[]): SalaryLine[] =>
      rows.map((x) => ({ label: cleanLabel(x.label), minor: toMinor(x.amount) }));
    const earnings = lines(dto.earnings);
    const deductions = lines(dto.deductions);
    const problems = checkSalary(earnings, deductions);
    if (problems.length) {
      throw new AppError('request.invalid', 'The salary structure has invalid values', 400, {
        fields: problems.map((p) => p.message),
        problems,
      });
    }
    // Nothing changed: no write and no audit row.
    if (sameLines(earnings, r.earnings) && sameLines(deductions, r.deductions)) return this.view(r, user);

    const labels = (l: readonly SalaryLine[]) => l.map((x) => x.label);
    const saved = await this.repo.replace(
      r.id,
      earnings,
      deductions,
      {
        before: { earnings: labels(r.earnings), deductions: labels(r.deductions) },
        after: {
          earnings: labels(earnings),
          deductions: labels(deductions),
          amountsChanged: !sameAmounts(r, earnings, deductions),
        },
      },
      actorOf(user),
    );
    return this.view(saved, user);
  }

  private async find(employeeCode: string, scope: EmployeeScope): Promise<SalaryRecord> {
    const r = await this.repo.findByCode(scope, employeeCode.toUpperCase());
    if (!r) throw notFound('employee');
    return r;
  }

  private view(r: SalaryRecord, user: AuthUser): SalaryResponse {
    const template = r.location.template;
    return SalaryResponse.from({
      employeeCode: r.employeeCode,
      template,
      currency: CURRENCY[template],
      earnings: r.earnings,
      deductions: r.deductions,
      canEdit:
        hasPermission(user.permissions, salary, 'edit') &&
        r.id !== user.employeeId &&
        inEmployeeScope(employeeScopeOf(user, 'edit'), r),
    });
  }
}

/** Salary → View reads within the directory scope; without it, only your own salary. */
const readScope = (user: AuthUser): EmployeeScope =>
  hasPermission(user.permissions, salary) ? employeeScopeOf(user) : { kind: 'SELF', employeeId: user.employeeId };

/** Whether any amount differs, by label (a rename or reorder alone is not an amount change). */
const sameAmounts = (r: SalaryRecord, earnings: readonly SalaryLine[], deductions: readonly SalaryLine[]) => {
  const key = (k: string, l: SalaryLine) => `${k}|${l.label.toLowerCase()}|${l.minor}`;
  const set = (e: readonly SalaryLine[], d: readonly SalaryLine[]) =>
    [...e.map((l) => key('e', l)), ...d.map((l) => key('d', l))].sort().join('\n');
  return set(r.earnings, r.deductions) === set(earnings, deductions);
};
