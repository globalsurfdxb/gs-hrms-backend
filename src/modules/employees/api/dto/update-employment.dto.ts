import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** "" from an empty select means "none" for the fields that may be empty. */
const BlankIsNull = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : value));
/** For fields that are always on file: left out = unchanged, but null or "" is rejected rather than ignored. */
const Given = () => ValidateIf((_o: unknown, v: unknown) => v !== undefined);

export const EMPLOYMENT_TYPES = ['PERMANENT', 'CONTRACT', 'PROBATION'] as const;

/* PATCH semantics: a field left out stays as it is. BR-EMP-004: email, employee code, employment status and role are
   not here — sign-in identity and status are owned by onboarding/offboarding and Roles & Access. Identity, bank and
   salary have their own endpoints. */
export class UpdateEmploymentDto {
  @ApiPropertyOptional({ example: 'Sam Example', description: 'Full name as per passport' })
  @Given()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Dubai',
    description: 'Work location id. Moving between UAE and India switches emergency contact groups (BR-EMP-001)',
  })
  @Given()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Organization; must operate in the work location (BR-EMP-002)' })
  @Given()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Belongs to the organization and the location (BR-EMP-002)',
  })
  @BlankIsNull()
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Belongs to the department' })
  @BlankIsNull()
  @IsOptional()
  @IsUUID()
  designationId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'null = no manager. Not in the employee’s own reporting line (BR-EMP-003)',
  })
  @BlankIsNull()
  @IsOptional()
  @IsUUID()
  reportingManagerId?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, example: 'PERMANENT' })
  @Given()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @ApiPropertyOptional({ example: '2024-03-01', description: 'Calendar day' })
  @Given()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfJoining must be YYYY-MM-DD' })
  dateOfJoining?: string;
}
