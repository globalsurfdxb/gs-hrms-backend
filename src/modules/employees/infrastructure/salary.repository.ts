import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { fromMinor, toMinor, type SalaryKind, type SalaryLine } from '../domain/salary.rules.js';
import { employeeInScope } from './employee-scope.where.js';

const SALARY = {
  id: true,
  employeeCode: true,
  reportingManagerId: true,
  location: { select: { template: true } },
  salaryComponents: {
    select: { kind: true, label: true, amount: true },
    orderBy: [{ kind: 'asc' }, { position: 'asc' }],
  },
} as const satisfies Prisma.EmployeeSelect;

type Row = Prisma.EmployeeGetPayload<{ select: typeof SALARY }>;
export interface SalaryRecord extends Omit<Row, 'salaryComponents'> {
  earnings: SalaryLine[];
  deductions: SalaryLine[];
}

/** Audit row content: labels and whether amounts changed — never amounts (hiring.md Q8, BR-EMP-005). */
export interface SalaryAudit {
  before: Prisma.InputJsonObject;
  after: Prisma.InputJsonObject;
}

/** Decimal(14,2) → fils / paise, exactly (the string form has at most 2 decimals). */
const minorOf = (d: Prisma.Decimal) => toMinor(d.toFixed(2));
const toRecord = (r: Row): SalaryRecord => {
  const { salaryComponents, ...rest } = r;
  const of = (k: SalaryKind) =>
    salaryComponents.filter((c) => c.kind === k).map((c) => ({ label: c.label, minor: minorOf(c.amount) }));
  return { ...rest, earnings: of('EARNING'), deductions: of('DEDUCTION') };
};

@Injectable()
export class SalaryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The salary of an employee in `scope`, or null: out of scope looks the same as not found. */
  async findByCode(scope: EmployeeScope, employeeCode: string): Promise<SalaryRecord | null> {
    const r = await this.prisma.employee.findFirst({
      where: { AND: [employeeInScope(scope), { employeeCode }] },
      select: SALARY,
    });
    return r && toRecord(r);
  }

  /** Replaces the whole structure and writes its audit row, in one transaction. */
  replace(
    employeeId: string,
    earnings: readonly SalaryLine[],
    deductions: readonly SalaryLine[],
    audit: SalaryAudit,
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.salaryComponent.deleteMany({ where: { employeeId } });
      const rows = (kind: SalaryKind, lines: readonly SalaryLine[]) =>
        lines.map((l, position) => ({ employeeId, kind, position, label: l.label, amount: fromMinor(l.minor) }));
      await tx.salaryComponent.createMany({ data: [...rows('EARNING', earnings), ...rows('DEDUCTION', deductions)] });
      await this.audit.record(
        {
          actor,
          module: 'Salary',
          action: 'employee.salary_updated',
          entityType: 'employee',
          entityId: employeeId,
          before: audit.before,
          after: audit.after,
        },
        tx,
      );
      return toRecord(await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: SALARY }));
    });
  }

  /** Security.md: views of someone else's salary are audited (no amounts). */
  recordView(employeeId: string, actor: AuditActor) {
    return this.audit.record({
      actor,
      module: 'Salary',
      action: 'employee.salary_viewed',
      entityType: 'employee',
      entityId: employeeId,
    });
  }
}
