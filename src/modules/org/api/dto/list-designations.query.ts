import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListDesignationsQuery {
  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a02' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
