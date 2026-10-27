import { ApiProperty } from '@nestjs/swagger';
import type { LocationRecord } from '../../infrastructure/locations.repository.js';

/* Explicit response shape. Never return Prisma records directly — every field that leaves the API is listed here. */
export class LocationResponse {
  @ApiProperty({ example: 'Dubai', description: 'Readable id, used as the key everywhere' }) id: string;
  @ApiProperty({ example: 'United Arab Emirates' }) name: string;
  @ApiProperty({ example: 'Dubai' }) city: string;
  @ApiProperty({ example: 'AED' }) currency: string;
  @ApiProperty({ example: 'Asia/Dubai' }) timezone: string;
  @ApiProperty({ example: '+971' }) phoneCode: string;
  @ApiProperty({ example: 9 }) phoneDigits: number;
  @ApiProperty({ nullable: true, type: String, example: '50 123 4567' }) phoneExample: string | null;
  @ApiProperty({ example: '09:00 – 18:00, Mon–Fri' }) workingHours: string;
  @ApiProperty({ type: [String] }) seating: string[];
  @ApiProperty({ enum: ['UAE', 'INDIA'] }) template: 'UAE' | 'INDIA';
  @ApiProperty({ description: 'Built-in: cannot be deleted, template cannot change' }) system: boolean;
  @ApiProperty() updatedAt: string;

  static from(this: void, l: LocationRecord): LocationResponse {
    return {
      id: l.id,
      name: l.name,
      city: l.city,
      currency: l.currency,
      timezone: l.timezone,
      phoneCode: l.phoneCode,
      phoneDigits: l.phoneDigits,
      phoneExample: l.phoneExample,
      workingHours: l.workingHours,
      seating: l.seating,
      template: l.template,
      system: l.system,
      updatedAt: l.updatedAt.toISOString(),
    };
  }
}
