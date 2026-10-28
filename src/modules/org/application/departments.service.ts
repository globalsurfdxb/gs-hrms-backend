import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { AppError, conflict, notFound } from '../../../shared/errors/app-error.js';
import { DepartmentResponse } from '../api/dto/department.response.js';
import type { CreateDepartmentDto } from '../api/dto/create-department.dto.js';
import type { ListDepartmentsQuery } from '../api/dto/list-departments.query.js';
import type { UpdateDepartmentDto } from '../api/dto/update-department.dto.js';
import {
  assertDepartmentDeletable,
  assertHeadEligible,
  assertLocationsRemovable,
  checkDepartmentLocations,
} from '../domain/department.rules.js';
import {
  DepartmentsRepository,
  type DepartmentData,
  type DepartmentRecord,
} from '../infrastructure/departments.repository.js';

/* Use cases for departments (Company Structure). Orchestrates domain rules and the repository; no HTTP, no Prisma. */
@Injectable()
export class DepartmentsService {
  constructor(private readonly departments: DepartmentsRepository) {}

  async list(query: ListDepartmentsQuery): Promise<DepartmentResponse[]> {
    return (await this.departments.findAll(query)).map(DepartmentResponse.from);
  }

  async get(id: string): Promise<DepartmentResponse> {
    return DepartmentResponse.from(await this.found(id));
  }

  async create(dto: CreateDepartmentDto, user: AuthUser): Promise<DepartmentResponse> {
    const company = await this.departments.company(dto.companyId);
    if (!company) throw new AppError('department.unknown_company', 'Unknown company');

    const name = dto.name.trim();
    await this.checkNameFree(company.id, name);
    const data: DepartmentData = {
      companyId: company.id,
      name,
      locationIds: checkDepartmentLocations(dto.locationIds, await this.departments.locationIds(), company.locationId),
      headEmployeeId: dto.headEmployeeId ?? null,
    };
    if (data.headEmployeeId) await this.checkHead(data.headEmployeeId, company.id);
    return DepartmentResponse.from(await this.departments.create(data, actorOf(user)));
  }

  async update(id: string, dto: UpdateDepartmentDto, user: AuthUser): Promise<DepartmentResponse> {
    const record = await this.found(id);
    const before = dataOf(record);

    const changes: Partial<Omit<DepartmentData, 'companyId'>> = {};
    if (dto.name !== undefined) {
      changes.name = dto.name.trim();
      await this.checkNameFree(before.companyId, changes.name, id);
    }
    if (dto.locationIds !== undefined) {
      const company = (await this.departments.company(before.companyId))!;
      const next = checkDepartmentLocations(dto.locationIds, await this.departments.locationIds(), company.locationId);
      const removed = before.locationIds.filter((l) => !next.includes(l));
      if (removed.length > 0) assertLocationsRemovable(await this.departments.staffByLocation(id, removed));
      changes.locationIds = next;
    }
    if (dto.headEmployeeId !== undefined) {
      if (dto.headEmployeeId !== null) await this.checkHead(dto.headEmployeeId, before.companyId);
      changes.headEmployeeId = dto.headEmployeeId;
    }
    if (Object.keys(changes).length === 0) return DepartmentResponse.from(record);

    return DepartmentResponse.from(await this.departments.update(id, before, changes, actorOf(user)));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const record = await this.found(id);
    await this.departments.delete(id, dataOf(record), actorOf(user), assertDepartmentDeletable);
  }

  private async found(id: string): Promise<DepartmentRecord> {
    const department = await this.departments.findById(id);
    if (!department) throw notFound('department');
    return department;
  }

  private async checkNameFree(companyId: string, name: string, exceptId?: string) {
    if (await this.departments.nameTaken(companyId, name, exceptId)) {
      throw conflict('department.name_taken', `The company already has a department called "${name}"`);
    }
  }

  private async checkHead(employeeId: string, companyId: string) {
    assertHeadEligible(await this.departments.employee(employeeId), companyId);
  }
}

const dataOf = (d: DepartmentRecord): DepartmentData => ({
  companyId: d.companyId,
  name: d.name,
  locationIds: d.locations.map((l) => l.locationId).sort(),
  headEmployeeId: d.headEmployeeId,
});
