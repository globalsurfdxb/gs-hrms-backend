import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { EXITS, STAGES } from '../../domain/application.rules.js';
import { CANDIDATE_SOURCES } from '../../domain/candidate.rules.js';

class Paging {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ListCandidatesQuery extends Paging {
  @ApiPropertyOptional({ example: 'priya', description: 'Name, email, phone, company, title, city or tag' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a10', description: 'Applied to this job' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ enum: STAGES, description: 'Has an active (not exited) application at this stage' })
  @IsOptional()
  @IsIn(STAGES)
  stage?: (typeof STAGES)[number];

  @ApiPropertyOptional({ enum: CANDIDATE_SOURCES })
  @IsOptional()
  @IsIn(CANDIDATE_SOURCES)
  source?: (typeof CANDIDATE_SOURCES)[number];

  @ApiPropertyOptional({ example: 'Shortlisted' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;
}

export class DuplicatesQuery {
  @ApiPropertyOptional({ example: 'priya.nair@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+971 50 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export const PIPELINE_SORTS = ['applied', 'name', 'stage', 'inStage'] as const;

export class ListApplicationsQuery extends Paging {
  @ApiPropertyOptional({ enum: STAGES, description: 'Active (not exited) applications at this stage' })
  @IsOptional()
  @IsIn(STAGES)
  stage?: (typeof STAGES)[number];

  @ApiPropertyOptional({
    enum: [...EXITS, 'NONE'],
    description: 'An exit, or NONE for applications still in the pipeline',
  })
  @IsOptional()
  @IsIn([...EXITS, 'NONE'])
  exit?: (typeof EXITS)[number] | 'NONE';

  @ApiPropertyOptional({ example: 'priya', description: 'Name, email, phone, company, title, city or tag' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CANDIDATE_SOURCES })
  @IsOptional()
  @IsIn(CANDIDATE_SOURCES)
  source?: (typeof CANDIDATE_SOURCES)[number];

  @ApiPropertyOptional({ example: 'Shortlisted' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional({ example: 7, description: 'Applied in the last N days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  appliedWithinDays?: number;

  @ApiPropertyOptional({ example: 14, description: 'In the current stage for at least N days (stalled)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  inStageForDays?: number;

  @ApiPropertyOptional({ enum: PIPELINE_SORTS, default: 'applied' })
  @IsOptional()
  @IsIn(PIPELINE_SORTS)
  sort?: (typeof PIPELINE_SORTS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
