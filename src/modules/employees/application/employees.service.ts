import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { employeeScopeOf } from '../../../core/iam/data-scope.js';
import { notFound } from '../../../shared/errors/app-error.js';
import { EmployeeResponse, type EmployeeListResponse } from '../api/dto/employee.response.js';
import type { ListEmployeesQuery } from '../api/dto/list-employees.query.js';
import { EmployeesRepository } from '../infrastructure/employees.repository.js';

/* The employee directory (spec docs/modules/employees.md). Every read goes through the caller's data scope
   (core/iam/data-scope.ts): everyone, self + direct reports, or self. Someone outside it is a 404. */
@Injectable()
export class EmployeesService {
  constructor(private readonly employees: EmployeesRepository) {}

  async list(query: ListEmployeesQuery, user: AuthUser): Promise<EmployeeListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const scope = employeeScopeOf(user);
    const { items, total } = await this.employees.list(
      scope,
      {
        q: query.q,
        status: query.status,
        type: query.type,
        companyId: query.companyId,
        departmentId: query.departmentId,
        designationId: query.designationId,
        locationId: query.locationId,
      },
      page,
      pageSize,
    );
    return { scope: scope.kind, items: items.map(EmployeeResponse.from), total, page, pageSize };
  }

  async get(employeeCode: string, user: AuthUser): Promise<EmployeeResponse> {
    const e = await this.employees.findByCode(employeeScopeOf(user), employeeCode.toUpperCase());
    if (!e) throw notFound('employee');
    return EmployeeResponse.from(e);
  }
}
