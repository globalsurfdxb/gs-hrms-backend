import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({ example: 'GS-120', description: 'Employee code of a seeded persona' })
  @IsString()
  @Matches(/^GS-\d{3,}$/)
  employeeCode: string;
}

export class DevPasswordLoginDto {
  @ApiProperty({ example: 'gs-120@hrms.local', description: 'A seeded demo account' })
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ example: 'demo1234', description: 'DEV_LOGIN_PASSWORD (backend .env)' })
  @IsString()
  @MaxLength(200)
  password: string;
}

export class DevPersonaResponse {
  @ApiProperty() employeeCode: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ example: 'gs-120@hrms.local' }) email: string;
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
