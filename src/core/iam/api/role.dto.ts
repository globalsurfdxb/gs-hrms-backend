import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const KEYS_EXAMPLE = ['administration:admin-companies', 'administration:admin-companies#edit'];
const KEYS_DESCRIPTION =
  'Permission keys from GET /iam/catalog: `<feature>` = View, `<feature>#add|edit|delete`. Add/Edit/Delete need View.';

export class CreateRoleDto {
  @ApiProperty({ example: 'Payroll Clerk', description: '2–60 characters, unique ignoring case' })
  @IsString()
  @Length(2, 60)
  name: string;

  @ApiPropertyOptional({ example: 'Prepares monthly payroll, no approvals' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: KEYS_EXAMPLE, description: `${KEYS_DESCRIPTION} Defaults to none.` })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Payroll Officer', description: 'System roles cannot be renamed' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @ApiPropertyOptional({ example: 'Prepares and submits monthly payroll' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({
    example: KEYS_EXAMPLE,
    description: `The complete new set — it replaces the current one. ${KEYS_DESCRIPTION}`,
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  permissions: string[];
}

export class AssignRoleDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a09' })
  @IsUUID()
  roleId: string;
}
