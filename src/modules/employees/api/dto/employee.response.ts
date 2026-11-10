import { ApiProperty } from '@nestjs/swagger';
import type { DataScope } from '../../../../core/iam/data-scope.js';
import type { EmployeeRecord } from '../../infrastructure/employees.repository.js';

export class EmployeeRefResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS IT' }) name: string;
}

export class EmployeePersonResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS-120' }) employeeCode: string;
  @ApiProperty({ example: 'Dev Super Admin' }) name: string;
}

/* Explicit response shape: the directory card. Never return Prisma records directly. */
export class EmployeeResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS-087' }) employeeCode: string;
  @ApiProperty({ example: 'Dev Employee' }) name: string;
  @ApiProperty({ example: 'gs-087@hrms.local' }) email: string;
  @ApiProperty({ enum: ['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'INACTIVE'] }) status: string;
  @ApiProperty({ enum: ['PERMANENT', 'CONTRACT', 'PROBATION'] }) employmentType: string;
  @ApiProperty({ example: '2024-03-01', description: 'Calendar day' }) dateOfJoining: string;
  @ApiProperty({ type: EmployeeRefResponse }) company: EmployeeRefResponse;
  @ApiProperty({ type: EmployeeRefResponse, nullable: true }) department: EmployeeRefResponse | null;
  @ApiProperty({ type: EmployeeRefResponse, nullable: true, description: '`name` is the designation title' })
  designation: EmployeeRefResponse | null;
  @ApiProperty({ type: EmployeeRefResponse, example: { id: 'Dubai', name: 'Dubai' } }) location: EmployeeRefResponse;
  @ApiProperty({ type: EmployeePersonResponse, nullable: true }) reportingManager: EmployeePersonResponse | null;

  static from(this: void, e: EmployeeRecord): EmployeeResponse {
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.fullName,
      email: e.email,
      status: e.employmentStatus,
      employmentType: e.employmentType,
      dateOfJoining: e.dateOfJoining.toISOString().slice(0, 10),
      company: e.company,
      department: e.department,
      designation: e.designation && { id: e.designation.id, name: e.designation.title },
      location: e.location,
      reportingManager: e.reportingManager && {
        id: e.reportingManager.id,
        employeeCode: e.reportingManager.employeeCode,
        name: e.reportingManager.fullName,
      },
    };
  }
}

export class EmployeeListResponse {
  @ApiProperty({
    enum: ['ALL', 'TEAM', 'SELF'],
    description: 'Whose records this list can contain: everyone, you and your direct reports, or only you',
  })
  scope: DataScope;
  @ApiProperty({ type: [EmployeeResponse] }) items: EmployeeResponse[];
  @ApiProperty({ example: 7 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}
