import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a01', description: 'The company it belongs to' })
  @IsUUID()
  companyId: string;

  @ApiProperty({ example: 'Data & AI', description: 'Unique within the company, ignoring case' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({
    example: ['Dubai', 'Kochi'],
    description: 'At least one; only the company location unless the company operates in every location',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  locationIds: string[];

  @ApiPropertyOptional({
    example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06',
    description: 'A current employee of the same company',
  })
  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;
}
