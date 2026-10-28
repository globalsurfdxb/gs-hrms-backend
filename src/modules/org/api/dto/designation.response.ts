import { ApiProperty } from '@nestjs/swagger';
import type { DesignationRecord } from '../../infrastructure/designations.repository.js';

/* Explicit response shape. Never return Prisma records directly — every field that leaves the API is listed here. */
export class DesignationResponse {
  @ApiProperty() id: string;
  @ApiProperty() departmentId: string;
  @ApiProperty({ example: 'Solutions Architect' }) title: string;
  @ApiProperty() updatedAt: string;

  static from(this: void, d: DesignationRecord): DesignationResponse {
    return { id: d.id, departmentId: d.departmentId, title: d.title, updatedAt: d.updatedAt.toISOString() };
  }
}
