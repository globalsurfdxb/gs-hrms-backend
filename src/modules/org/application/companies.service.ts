import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { AppError, notFound } from '../../../shared/errors/app-error.js';
import { CompanyResponse } from '../api/dto/company.response.js';
import type { CreateCompanyDto } from '../api/dto/create-company.dto.js';
import type { UpdateCompanyDto } from '../api/dto/update-company.dto.js';
import { assertCompanyDeletable, locationIdFromInput, normaliseShortCode } from '../domain/company.rules.js';
import { CompaniesRepository, type CompanyData } from '../infrastructure/companies.repository.js';

/* Use cases for companies. Orchestrates domain rules and the repository; no HTTP and no Prisma here. */
@Injectable()
export class CompaniesService {
  constructor(private readonly companies: CompaniesRepository) {}

  async list(): Promise<CompanyResponse[]> {
    return (await this.companies.findAll()).map(CompanyResponse.from);
  }

  async get(id: string): Promise<CompanyResponse> {
    const company = await this.companies.findById(id);
    if (!company) throw notFound('company');
    return CompanyResponse.from(company);
  }

  async create(dto: CreateCompanyDto, user: AuthUser): Promise<CompanyResponse> {
    const data: CompanyData = {
      name: dto.name.trim(),
      shortCode: normaliseShortCode(dto.shortCode),
      description: dto.description?.trim() ?? '',
      website: dto.website?.trim() ?? '',
      locationId: await this.checkedLocation(dto.location),
      established: dto.established ?? null,
      status: 'ACTIVE',
    };
    return CompanyResponse.from(await this.companies.create(data, actorOf(user)));
  }

  async update(id: string, dto: UpdateCompanyDto, user: AuthUser): Promise<CompanyResponse> {
    const before = await this.companies.findById(id);
    if (!before) throw notFound('company');

    const changes: Partial<CompanyData> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.shortCode !== undefined) changes.shortCode = normaliseShortCode(dto.shortCode);
    if (dto.description !== undefined) changes.description = dto.description.trim();
    if (dto.website !== undefined) changes.website = dto.website.trim();
    if (dto.location !== undefined) changes.locationId = await this.checkedLocation(dto.location);
    if (dto.established !== undefined) changes.established = dto.established;
    if (dto.status !== undefined) changes.status = dto.status;
    if (Object.keys(changes).length === 0) return CompanyResponse.from(before);

    return CompanyResponse.from(await this.companies.update(id, before, changes, actorOf(user)));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const before = await this.companies.findById(id);
    if (!before) throw notFound('company');
    await this.companies.delete(id, before, actorOf(user), assertCompanyDeletable);
  }

  private async checkedLocation(location: string): Promise<string | null> {
    const id = locationIdFromInput(location);
    if (id && !(await this.companies.locationExists(id))) {
      throw new AppError('company.unknown_location', `Unknown location "${location}"`);
    }
    return id;
  }
}
