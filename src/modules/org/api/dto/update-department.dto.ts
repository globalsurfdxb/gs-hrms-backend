import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateDepartmentDto } from './create-department.dto.js';

/* The company never changes — employees and requisitions of the department belong to it. */
export class UpdateDepartmentDto extends PartialType(OmitType(CreateDepartmentDto, ['companyId', 'headEmployeeId'])) {
  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06',
    nullable: true,
    type: String,
    description: 'A current employee of the same company; null removes the head',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  headEmployeeId?: string | null;
}
