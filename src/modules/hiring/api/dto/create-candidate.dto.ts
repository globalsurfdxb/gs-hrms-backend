import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CANDIDATE_SOURCES } from '../../domain/candidate.rules.js';
import { AMOUNT } from './create-requisition.dto.js';

/** A plain file name (no folders) ending in .pdf, .doc or .docx. Only the name is stored until file storage exists. */
const CV_NAME = /^[^\\/:*?"<>|\p{Cc}]{1,250}\.(pdf|docx?)$/iu;

/* Location, currency, phone key, consent time and history are set by the server. Salary may only be sent by callers
   who may see it (403 otherwise). */
export class CreateCandidateDto {
  @ApiProperty({ example: 'Priya Nair' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({ example: 'priya.nair@example.com', description: 'Stored lower-case; one candidate per email' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '+971 50 123 4567', description: 'With the country code; at least 7 digits' })
  @IsString()
  @Length(7, 30)
  phone: string;

  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a10',
    description: 'An OPEN job: also creates the application, and the candidate takes the job location',
  })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ example: 'Dubai', description: 'Required without jobId; ignored with it' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentCity?: string;

  @ApiPropertyOptional({ example: 'Emirates Networks LLC' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentCompany?: string;

  @ApiPropertyOptional({ example: 'Network Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentTitle?: string;

  @ApiProperty({ example: 4.5, minimum: 0, maximum: 60, description: 'Total years; one decimal' })
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(60)
  experienceYears: number;

  @ApiPropertyOptional({ example: 30, minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticeDays?: number;

  @ApiPropertyOptional({ example: '9000', description: 'UAE per month, India per year; needs salary access' })
  @IsOptional()
  @Matches(AMOUNT, { message: 'currentSalary must be an amount like 9000 or 9000.50' })
  currentSalary?: string;

  @ApiPropertyOptional({ example: '11000', description: 'UAE per month, India per year; needs salary access' })
  @IsOptional()
  @Matches(AMOUNT, { message: 'expectedSalary must be an amount like 11000 or 11000.50' })
  expectedSalary?: string;

  @ApiPropertyOptional({ example: 'Employment visa (transferable)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  visaStatus?: string;

  @ApiProperty({ enum: CANDIDATE_SOURCES, example: 'LINKEDIN', description: 'CAREERS_PAGE = the company website' })
  @IsIn(CANDIDATE_SOURCES)
  source: (typeof CANDIDATE_SOURCES)[number];

  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a04',
    description: 'Active employee; required when source is EMPLOYEE_REFERRAL, ignored otherwise',
  })
  @IsOptional()
  @IsUUID()
  referrerId?: string;

  @ApiPropertyOptional({ example: 'TalentHub', description: 'Required when source is AGENCY, ignored otherwise' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  agency?: string;

  @ApiPropertyOptional({ example: 'Priya_Nair_CV.pdf', description: 'File name only (.pdf, .doc, .docx)' })
  @IsOptional()
  @Matches(CV_NAME, { message: 'cvName must be a file name ending in .pdf, .doc or .docx' })
  cvName?: string;

  @ApiPropertyOptional({ example: 'linkedin.com/in/priya-nair' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  links?: string;

  @ApiPropertyOptional({ example: ['Shortlisted', 'Fortinet NSE4'], description: 'At most 20; trimmed, de-duplicated' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Strong SD-WAN background; available in 30 days.', description: 'First note' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ example: true, description: 'The candidate agreed to their data being stored; must be true' })
  @IsBoolean()
  consent: boolean;
}
