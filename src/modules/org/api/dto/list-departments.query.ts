import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListDepartmentsQuery {
  @ApiPropertyOptional({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a01' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ example: 'Dubai', description: 'Departments that operate in this location' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  locationId?: string;
}
