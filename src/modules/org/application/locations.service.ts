import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { conflict, notFound } from '../../../shared/errors/app-error.js';
import { LocationResponse } from '../api/dto/location.response.js';
import type { CreateLocationDto } from '../api/dto/create-location.dto.js';
import type { UpdateLocationDto } from '../api/dto/update-location.dto.js';
import {
  assertLocationDeletable,
  assertTemplateChangeAllowed,
  assertTimezone,
  locationIdFor,
  normaliseCurrency,
  normalisePhoneCode,
  normaliseSeating,
} from '../domain/location.rules.js';
import { LocationsRepository, type LocationData, type LocationRecord } from '../infrastructure/locations.repository.js';

/* Use cases for locations (System Settings). Orchestrates domain rules and the repository; no HTTP and no Prisma. */
@Injectable()
export class LocationsService {
  constructor(private readonly locations: LocationsRepository) {}

  async list(): Promise<LocationResponse[]> {
    return (await this.locations.findAll()).map(LocationResponse.from);
  }

  async get(id: string): Promise<LocationResponse> {
    return LocationResponse.from(await this.found(id));
  }

  async create(dto: CreateLocationDto, user: AuthUser): Promise<LocationResponse> {
    const name = dto.name.trim();
    await this.checkNameFree(name);
    const data: LocationData = {
      name,
      city: dto.city?.trim() ?? '',
      currency: normaliseCurrency(dto.currency),
      timezone: assertTimezone(dto.timezone),
      phoneCode: normalisePhoneCode(dto.phoneCode),
      phoneDigits: dto.phoneDigits,
      phoneExample: dto.phoneExample?.trim() || null,
      workingHours: dto.workingHours?.trim() ?? '',
      seating: normaliseSeating(dto.seating ?? []),
      template: dto.template,
    };
    const label = data.city || data.name;
    const id = locationIdFor(label, await this.locations.idsStartingWith(label.slice(0, 3)));
    return LocationResponse.from(await this.locations.create(id, data, actorOf(user)));
  }

  async update(id: string, dto: UpdateLocationDto, user: AuthUser): Promise<LocationResponse> {
    const before = await this.found(id);

    const changes: Partial<LocationData> = {};
    if (dto.name !== undefined) {
      changes.name = dto.name.trim();
      await this.checkNameFree(changes.name, id);
    }
    if (dto.city !== undefined) changes.city = dto.city.trim();
    if (dto.currency !== undefined) changes.currency = normaliseCurrency(dto.currency);
    if (dto.timezone !== undefined) changes.timezone = assertTimezone(dto.timezone);
    if (dto.phoneCode !== undefined) changes.phoneCode = normalisePhoneCode(dto.phoneCode);
    if (dto.phoneDigits !== undefined) changes.phoneDigits = dto.phoneDigits;
    if (dto.phoneExample !== undefined) changes.phoneExample = dto.phoneExample.trim() || null;
    if (dto.workingHours !== undefined) changes.workingHours = dto.workingHours.trim();
    if (dto.seating !== undefined) changes.seating = normaliseSeating(dto.seating);
    if (dto.template !== undefined) {
      assertTemplateChangeAllowed(before, dto.template);
      changes.template = dto.template;
    }
    if (Object.keys(changes).length === 0) return LocationResponse.from(before);

    return LocationResponse.from(await this.locations.update(id, dataOf(before), changes, actorOf(user)));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const before = await this.found(id);
    assertLocationDeletable(before, await this.locations.usage(id));
    await this.locations.delete(id, dataOf(before), actorOf(user));
  }

  private async found(id: string): Promise<LocationRecord> {
    const location = await this.locations.findById(id);
    if (!location) throw notFound('location');
    return location;
  }

  private async checkNameFree(name: string, exceptId?: string) {
    if (await this.locations.nameTaken(name, exceptId)) {
      throw conflict('location.name_taken', `A location called "${name}" already exists`);
    }
  }
}

const dataOf = ({ id: _id, system: _system, updatedAt: _updatedAt, ...data }: LocationRecord): LocationData => data;
