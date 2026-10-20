import { ApiProperty } from '@nestjs/swagger';
import type { CompanyRecord } from '../../infrastructure/companies.repository.js';
import { locationIdToOutput } from '../../domain/company.rules.js';

/* Explicit response shape. Never return Prisma records directly — every field that leaves the API is listed here. */
export class CompanyResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() shortCode: string;
  @ApiProperty() description: string;
  @ApiProperty() website: string;
  @ApiProperty({ description: 'Location id, or "Both"' }) location: string;
  @ApiProperty({ nullable: true, type: String }) established: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: 'ACTIVE' | 'INACTIVE';
  @ApiProperty() updatedAt: string;

  static from(this: void, c: CompanyRecord): CompanyResponse {
    return {
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
      description: c.description,
      website: c.website,
      location: locationIdToOutput(c.locationId),
      established: c.established,
      status: c.status,
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
