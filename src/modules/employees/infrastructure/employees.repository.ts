import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { EmploymentStatus, EmploymentType, Prisma } from '../../../generated/prisma/client.js';
import { employeeInScope } from './employee-scope.where.js';

export interface EmployeeFilter {
  q?: string;
  status?: EmploymentStatus;
  type?: EmploymentType;
  companyId?: string;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
}

/* Directory fields only. Profile, identity, bank and salary arrive with their own tables and access levels. */
const EMPLOYEE = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  employmentStatus: true,
  employmentType: true,
  dateOfJoining: true,
  company: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  reportingManager: { select: { id: true, employeeCode: true, fullName: true } },
} as const satisfies Prisma.EmployeeSelect;

export type EmployeeRecord = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE }>;

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: EmployeeScope, filter: EmployeeFilter, page: number, pageSize: number) {
    const q = filter.q?.trim();
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeInScope(scope),
        {
          ...(filter.status && { employmentStatus: filter.status }),
          ...(filter.type && { employmentType: filter.type }),
          ...(filter.companyId && { companyId: filter.companyId }),
          ...(filter.departmentId && { departmentId: filter.departmentId }),
          ...(filter.designationId && { designationId: filter.designationId }),
          ...(filter.locationId && { locationId: filter.locationId }),
          ...(q && {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { employeeCode: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }),
        },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: EMPLOYEE,
        orderBy: [{ fullName: 'asc' }, { employeeCode: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total };
  }

  /** An employee the caller may see, or null: out of scope looks the same as not found. */
  findByCode(scope: EmployeeScope, employeeCode: string): Promise<EmployeeRecord | null> {
    return this.prisma.employee.findFirst({
      where: { AND: [employeeInScope(scope), { employeeCode }] },
      select: EMPLOYEE,
    });
  }
}
