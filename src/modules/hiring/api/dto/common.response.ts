import { ApiProperty } from '@nestjs/swagger';

/* Small shapes shared by the hiring responses. */

export class RefResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS IT' }) name: string;
}

export class PersonRefResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'GS-058' }) employeeCode: string;
  @ApiProperty({ example: 'Dev Team Lead' }) name: string;
}

export class MoneyResponse {
  @ApiProperty({ example: '9000.00', description: 'Decimal as a string — never a float' }) amount: string;
  @ApiProperty({ example: 'AED' }) currency: string;
}

/** An employee as other records show them. */
export const person = (p: { id: string; employeeCode: string; fullName: string }): PersonRefResponse => ({
  id: p.id,
  employeeCode: p.employeeCode,
  name: p.fullName,
});
