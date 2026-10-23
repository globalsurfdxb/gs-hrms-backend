import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ChangeRecruiterDto {
  @ApiProperty({ example: '0199f3a2-7c1e-7b40-9a55-2f6c7e9d1a06', description: 'An active employee' })
  @IsUUID()
  recruiterId: string;
}
