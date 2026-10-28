import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class CreateDesignationDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a02', description: 'The department it belongs to' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ example: 'Cloud Engineer', description: 'Unique within the department, ignoring case' })
  @IsString()
  @Length(2, 120)
  title: string;
}
