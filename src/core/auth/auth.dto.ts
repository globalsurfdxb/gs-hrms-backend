import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({ example: 'GS-120', description: 'Employee code of a seeded persona' })
  @IsString()
  @Matches(/^GS-\d{3,}$/)
  employeeCode: string;
}

export class DevPersonaResponse {
  @ApiProperty() employeeCode: string;
  @ApiProperty() fullName: string;
  @ApiProperty() role: string;
}

export class MeResponse {
  @ApiProperty() employeeId: string;
  @ApiProperty() employeeCode: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty() role: string;
  @ApiProperty() locationId: string;
  @ApiProperty() companyId: string;
  @ApiProperty({ type: [String], description: 'Granted permission keys (frontend catalogue format)' })
  permissions: string[];
}
