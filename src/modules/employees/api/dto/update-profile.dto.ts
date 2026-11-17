import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ALL_EMERGENCY_GROUPS,
  BLOOD_GROUPS,
  GENDERS,
  MARITAL_STATUSES,
  WORK_MODES,
} from '../../domain/profile.rules.js';

/** A blank optional field means "not on file": the form sends "" for an empty input. */
const BlankIsNull = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : value));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MSG = { message: '$property must be YYYY-MM-DD' };
/** Same rule as the frontend `phoneOk`: digits, spaces, dashes and brackets, optional leading +, 7–15 digits. */
const PHONE = /^(?=(?:\D*\d){7,15}\D*$)[+\d][\d\s\-()]*$/;
const PHONE_MSG = { message: '$property must be a phone number (7–15 digits)' };

export class EmergencyContactDto {
  @ApiProperty({ enum: ALL_EMERGENCY_GROUPS, example: 'Local Emergency Contact (UAE)', description: 'BR-EMP-010' })
  @IsIn(ALL_EMERGENCY_GROUPS)
  group: string;

  @ApiProperty({ example: 'Sam Example' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  relationship: string;

  @ApiProperty({ example: '+971 50 000 0000' })
  @Matches(PHONE, PHONE_MSG)
  mobile: string;
}

export class WorkExperienceDto {
  @ApiProperty({ example: 'Example Systems LLC' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  company: string;

  @ApiPropertyOptional({ example: 'Dubai, UAE' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ example: '2019-04-01', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(DAY, DAY_MSG)
  fromDate?: string | null;

  @ApiPropertyOptional({ example: '2023-02-28', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(DAY, DAY_MSG)
  toDate?: string | null;

  @ApiPropertyOptional({ example: 'Systems Engineer' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: WORK_MODES, example: 'Onsite' })
  @BlankIsNull()
  @IsOptional()
  @IsIn(WORK_MODES)
  workMode?: string;
}

export class EducationDto {
  @ApiProperty({ example: "Bachelor's Degree" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  qualification: string;

  @ApiPropertyOptional({ example: 'Example University' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  institution?: string;

  @ApiPropertyOptional({ example: 'Bachelor of Technology' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  course?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  field?: string;

  @ApiPropertyOptional({ example: 2012, nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  startYear?: number | null;

  @ApiPropertyOptional({ example: 2016, nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  endYear?: number | null;
}

export class FamilyMemberDto {
  @ApiProperty({ example: 'Alex Example' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Father' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  relationship: string;

  @ApiPropertyOptional({ example: 'Retired' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @ApiPropertyOptional({ example: '1965-08-20', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(DAY, DAY_MSG)
  dateOfBirth?: string | null;
}

/* PATCH semantics: a field left out stays as it is; null (or "") clears it. A list that is sent replaces the whole
   list ([] empties it). No identity, bank, salary, role, status or employment fields here — they have their own
   endpoints and access rules. */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sam', nullable: true, description: 'India keeps the name in parts' })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string | null;

  @ApiPropertyOptional({ example: '', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string | null;

  @ApiPropertyOptional({ example: 'Example', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string | null;

  @ApiPropertyOptional({ example: '1992-05-14', nullable: true, description: 'In the past' })
  @BlankIsNull()
  @IsOptional()
  @Matches(DAY, DAY_MSG)
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ example: 'India', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nationality?: string | null;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsIn(GENDERS)
  gender?: string | null;

  @ApiPropertyOptional({ enum: MARITAL_STATUSES, nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsIn(MARITAL_STATUSES)
  maritalStatus?: string | null;

  @ApiPropertyOptional({ enum: BLOOD_GROUPS, nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: string | null;

  @ApiPropertyOptional({ example: 'sam.example@example.com', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  personalEmail?: string | null;

  @ApiPropertyOptional({ example: '+971 50 000 0000', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(PHONE, PHONE_MSG)
  personalMobile?: string | null;

  @ApiPropertyOptional({ example: 'Flat 1, Example Tower, Dubai', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  currentAddress?: string | null;

  @ApiPropertyOptional({ example: 'Example House, Kochi, India', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  permanentAddress?: string | null;

  @ApiPropertyOptional({ example: '+971 4 000 0000', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(PHONE, PHONE_MSG)
  workPhone?: string | null;

  @ApiPropertyOptional({ example: '214', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(/^\d{1,6}$/, { message: 'extension must be up to 6 digits' })
  extension?: string | null;

  @ApiPropertyOptional({ example: 'Floor 3', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  seatingLocation?: string | null;

  @ApiPropertyOptional({ example: '2026-06-30', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @Matches(DAY, DAY_MSG)
  probationEnd?: string | null;

  @ApiPropertyOptional({ example: '4 yr 6 mo', nullable: true })
  @BlankIsNull()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  totalExperience?: string | null;

  @ApiPropertyOptional({ type: [EmergencyContactDto], description: 'Replaces the list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];

  @ApiPropertyOptional({ type: [WorkExperienceDto], description: 'Replaces the list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WorkExperienceDto)
  experience?: WorkExperienceDto[];

  @ApiPropertyOptional({ type: [EducationDto], description: 'Replaces the list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @ApiPropertyOptional({ type: [FamilyMemberDto], description: 'Replaces the list' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FamilyMemberDto)
  family?: FamilyMemberDto[];
}
