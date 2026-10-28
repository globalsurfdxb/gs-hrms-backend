import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/* Filters for the audit log. `from`/`to` are instants: the frontend turns its day pickers into the start and end of
   the day in the viewer's timezone, so no server-side timezone guess is needed. */
export class AuditFilterQuery {
  @ApiPropertyOptional({ example: 'company', description: 'Text in the actor, module, action or entity' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'Organization' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  module?: string;

  @ApiPropertyOptional({ example: 'company.updated' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06', description: 'Who acted' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'company' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a01', description: 'All events of one record' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00+04:00', description: 'From this instant (inclusive)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999+04:00', description: 'Up to this instant (inclusive)' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class ListAuditQuery extends AuditFilterQuery {
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

export class ExportAuditQuery extends OmitType(ListAuditQuery, ['page', 'pageSize']) {}
