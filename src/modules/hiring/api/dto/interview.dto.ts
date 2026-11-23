import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  INTERVIEW_DURATIONS,
  INTERVIEW_MODES,
  INTERVIEW_ROUNDS,
  NOTES_MAX,
  PANEL_MAX,
} from '../../domain/interview.rules.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_HINT = 'Local time of the job’s location (Dubai or Kochi), 24-hour HH:MM';

/* Interviews (hiring step 4, BR-HIR-010). The location, its timezone and the status are set by the server. */

export class ScheduleInterviewDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a10', description: 'An active application' })
  @IsUUID()
  applicationId: string;

  @ApiProperty({
    enum: INTERVIEW_ROUNDS,
    example: 'TECHNICAL',
    description: 'Moves the candidate forward to SCREENING / TECHNICAL_INTERVIEW / HR_INTERVIEW; FINAL moves nothing',
  })
  @IsIn(INTERVIEW_ROUNDS)
  round: (typeof INTERVIEW_ROUNDS)[number];

  @ApiProperty({ example: '2026-12-01', description: 'YYYY-MM-DD in the location’s timezone' })
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '10:00', description: TIME_HINT })
  @Matches(TIME, { message: 'time must be HH:MM (24-hour)' })
  time: string;

  @ApiProperty({ enum: INTERVIEW_DURATIONS, example: 60, description: 'Minutes' })
  @IsIn(INTERVIEW_DURATIONS)
  durationMin: (typeof INTERVIEW_DURATIONS)[number];

  @ApiProperty({ enum: INTERVIEW_MODES, example: 'TEAMS' })
  @IsIn(INTERVIEW_MODES)
  mode: (typeof INTERVIEW_MODES)[number];

  @ApiProperty({ type: [String], example: ['0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a05'], description: 'Active employees' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PANEL_MAX)
  @IsUUID('all', { each: true })
  panelIds: string[];

  @ApiPropertyOptional({ example: 'https://teams.microsoft.com/l/meetup-join/…', description: 'https only' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional({ example: 'Focus on firewall design.', maxLength: NOTES_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string;
}

/** A new time (required) and, optionally, the other details. The round never changes. */
export class RescheduleInterviewDto {
  @ApiProperty({ example: '2026-12-02', description: 'YYYY-MM-DD in the location’s timezone' })
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '14:30', description: TIME_HINT })
  @Matches(TIME, { message: 'time must be HH:MM (24-hour)' })
  time: string;

  @ApiPropertyOptional({ enum: INTERVIEW_DURATIONS, example: 45 })
  @IsOptional()
  @IsIn(INTERVIEW_DURATIONS)
  durationMin?: (typeof INTERVIEW_DURATIONS)[number];

  @ApiPropertyOptional({ enum: INTERVIEW_MODES, example: 'IN_PERSON' })
  @IsOptional()
  @IsIn(INTERVIEW_MODES)
  mode?: (typeof INTERVIEW_MODES)[number];

  @ApiPropertyOptional({ type: [String], description: 'Replaces the panel' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PANEL_MAX)
  @IsUUID('all', { each: true })
  panelIds?: string[];

  @ApiPropertyOptional({ example: '', description: 'https only; empty string removes it' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;
}

export const INTERVIEW_WHEN = ['upcoming', 'past', 'all'] as const;

export class ListInterviewsQuery {
  @ApiPropertyOptional({
    enum: INTERVIEW_WHEN,
    default: 'upcoming',
    description: 'upcoming = scheduled and not yet over (soonest first); past = the rest (latest first)',
  })
  @IsOptional()
  @IsIn(INTERVIEW_WHEN)
  when?: (typeof INTERVIEW_WHEN)[number];

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ description: 'One job’s interviews' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ description: 'One application’s interviews (candidate page)' })
  @IsOptional()
  @IsUUID()
  applicationId?: string;

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

/** The form's clash warning: which of these panelists already have an interview overlapping this time. */
export class InterviewClashesQuery {
  @ApiProperty({ description: 'The application being scheduled (its location gives the timezone)' })
  @IsUUID()
  applicationId: string;

  @ApiProperty({ example: '2026-12-01' })
  @Matches(DAY, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '10:00' })
  @Matches(TIME, { message: 'time must be HH:MM (24-hour)' })
  time: string;

  @ApiProperty({ enum: INTERVIEW_DURATIONS, example: 60 })
  @Type(() => Number)
  @IsIn(INTERVIEW_DURATIONS)
  durationMin: (typeof INTERVIEW_DURATIONS)[number];

  @ApiProperty({ type: String, example: 'id1,id2', description: 'Comma-separated employee ids' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PANEL_MAX)
  @IsUUID('all', { each: true })
  panelIds: string[];

  @ApiPropertyOptional({ description: 'When rescheduling: the interview itself, so it does not clash with itself' })
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
