import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/* Title, company, department, location, positions, budget and hiring manager come from the requisition.
   Code, status history and filled count are set by the server. */
export class CreateJobDto {
  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a03',
    description: "A designation of the requisition's department; defaults to the requisition's designation",
  })
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiProperty({ example: 'Design, deploy and support client networks.\nOwn incident response for managed customers.' })
  @IsString()
  @Length(1, 5000)
  description: string;

  @ApiProperty({ example: ['Cisco', 'Fortinet', 'SD-WAN'], description: 'At least one; trimmed and de-duplicated' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  skills: string[];

  @ApiProperty({ example: 2, minimum: 0, maximum: 50 })
  @IsInt()
  @Min(0)
  @Max(50)
  expMin: number;

  @ApiProperty({ example: 6, minimum: 0, maximum: 50, description: 'At least expMin' })
  @IsInt()
  @Min(0)
  @Max(50)
  expMax: number;

  @ApiPropertyOptional({ example: 'CCNA or higher' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qualifications?: string;

  @ApiProperty({ example: ['0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a05'], description: 'Active employees; at least one' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  panelIds: string[];

  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06', description: 'An active employee who runs this job' })
  @IsUUID()
  recruiterId: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  referralEligible?: boolean;

  @ApiProperty({ example: '2026-12-15', description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'closingDate must be YYYY-MM-DD' })
  closingDate: string;

  @ApiPropertyOptional({ example: true, description: 'true = OPEN now; false/omitted = DRAFT' })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
