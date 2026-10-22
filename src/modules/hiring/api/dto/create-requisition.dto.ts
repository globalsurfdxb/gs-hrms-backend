import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'CONTRACT', 'INTERN'] as const;
export const REQUISITION_REASONS = ['NEW_ROLE', 'REPLACEMENT'] as const;
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* Currency is not sent: it follows the location. Status, code and the approval chain are set by the server. */
export class CreateRequisitionDto {
  @ApiProperty({ example: 'Network Engineer' })
  @IsString()
  @Length(2, 120)
  title: string;

  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a01', description: 'An active company' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a02', description: 'A department of that company' })
  @IsUUID()
  departmentId: string;

  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a03',
    description: 'A designation of that department',
  })
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiProperty({ example: 'Dubai', description: 'Location id; sets the currency' })
  @IsString()
  @MaxLength(40)
  locationId: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 500 })
  @IsInt()
  @Min(1)
  @Max(500)
  positions: number;

  @ApiProperty({ enum: EMPLOYMENT_TYPES, example: 'FULL_TIME' })
  @IsIn(EMPLOYMENT_TYPES)
  employmentType: (typeof EMPLOYMENT_TYPES)[number];

  @ApiProperty({ enum: REQUISITION_REASONS, example: 'NEW_ROLE' })
  @IsIn(REQUISITION_REASONS)
  reason: (typeof REQUISITION_REASONS)[number];

  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a04',
    description: 'Required when reason is REPLACEMENT; ignored otherwise',
  })
  @ValidateIf((o: CreateRequisitionDto) => o.reason === 'REPLACEMENT' || o.replacesEmployeeId !== undefined)
  @IsUUID()
  replacesEmployeeId?: string;

  @ApiProperty({ example: '9000.00', description: 'Per position: monthly (UAE) or yearly CTC (India)' })
  @Matches(AMOUNT, { message: 'budgetMin must be an amount like 9000 or 9000.50' })
  budgetMin: string;

  @ApiProperty({ example: '12000.00' })
  @Matches(AMOUNT, { message: 'budgetMax must be an amount like 12000 or 12000.50' })
  budgetMax: string;

  @ApiProperty({ example: '2026-12-01', description: 'YYYY-MM-DD, not in the past (location timezone)' })
  @Matches(DAY, { message: 'targetStart must be YYYY-MM-DD' })
  targetStart: string;

  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a05', description: 'An active employee' })
  @IsUUID()
  hiringManagerId: string;

  @ApiProperty({ example: 'Two new managed-network clients from January need on-site support.' })
  @IsString()
  @Length(1, 2000)
  justification: string;

  @ApiPropertyOptional({ example: true, description: 'true = submit for approval now; false/omitted = save as draft' })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}
