import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED'] as const;

export class ListJobsQuery {
  @ApiPropertyOptional({ enum: JOB_STATUSES, example: 'OPEN' })
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: (typeof JOB_STATUSES)[number];

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06' })
  @IsOptional()
  @IsUUID()
  recruiterId?: string;

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
