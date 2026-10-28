import { ApiProperty } from '@nestjs/swagger';
import type { DepartmentRecord } from '../../infrastructure/departments.repository.js';

export class DepartmentHeadResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS-058' }) employeeCode: string;
  @ApiProperty({ example: 'Dev Team Lead' }) fullName: string;
}

export class DesignationSummaryResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Solutions Architect' }) title: string;
}

/* Explicit response shape. Never return Prisma records directly — every field that leaves the API is listed here. */
export class DepartmentResponse {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiProperty({ example: 'Cloud & Infra' }) name: string;
  @ApiProperty({ type: [String], example: ['Dubai'], description: 'Location ids, sorted' }) locationIds: string[];
  @ApiProperty({ type: DepartmentHeadResponse, nullable: true }) head: DepartmentHeadResponse | null;
  @ApiProperty({ type: [DesignationSummaryResponse], description: 'Sorted by title' })
  designations: DesignationSummaryResponse[];
  @ApiProperty() updatedAt: string;

  static from(this: void, d: DepartmentRecord): DepartmentResponse {
    return {
      id: d.id,
      companyId: d.companyId,
      name: d.name,
      locationIds: d.locations.map((l) => l.locationId).sort(),
      head: d.head ? { id: d.head.id, employeeCode: d.head.employeeCode, fullName: d.head.fullName } : null,
      designations: d.designations.map((x) => ({ id: x.id, title: x.title })),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
