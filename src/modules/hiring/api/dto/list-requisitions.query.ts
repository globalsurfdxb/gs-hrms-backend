import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REQUISITION_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ON_HOLD', 'CLOSED'] as const;

export class ListRequisitionsQuery {
  @ApiPropertyOptional({ enum: REQUISITION_STATUSES, example: 'PENDING_APPROVAL' })
  @IsOptional()
  @IsIn(REQUISITION_STATUSES)
  status?: (typeof REQUISITION_STATUSES)[number];

  @ApiPropertyOptional({ example: 'Dubai' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;

  @ApiPropertyOptional({ example: true, description: 'Only requisitions waiting on a step you can decide' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  waitingOnMe?: boolean;

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
