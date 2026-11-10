import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const EMPLOYMENT_STATUSES = ['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'INACTIVE'] as const;
export const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'PROBATION'] as const;

export class ListEmployeesQuery {
  @ApiPropertyOptional({ example: 'GS-08', description: 'Name, employee code or work email (contains, any case)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: EMPLOYMENT_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(EMPLOYMENT_STATUSES)
  status?: (typeof EMPLOYMENT_STATUSES)[number];

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, example: 'PERMANENT' })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  type?: (typeof EMPLOYMENT_TYPES)[number];

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06' })
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
