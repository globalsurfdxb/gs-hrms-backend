import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { AMOUNT, LABEL_MAX, MAX_LINES } from '../../domain/salary.rules.js';

export class SalaryLineDto {
  @ApiProperty({ example: 'Basic Salary', maxLength: LABEL_MAX })
  @IsString()
  @MaxLength(LABEL_MAX)
  label: string;

  @ApiProperty({ example: '9000.00', description: 'Up to 12 digits and 2 decimals, as a string. Zero is allowed.' })
  @IsString()
  @Matches(AMOUNT, { message: 'amount must be an amount like 9000 or 9000.50' })
  amount: string;
}

/* PUT /employees/:code/salary — the whole structure; it replaces what is saved. The currency is not sent: it follows
   the work location (AED for UAE, INR for India). Totals are calculated by the server. */
export class UpdateSalaryDto {
  @ApiProperty({ type: [SalaryLineDto], maxItems: MAX_LINES, description: 'In the order shown on the profile' })
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => SalaryLineDto)
  earnings: SalaryLineDto[];

  @ApiProperty({ type: [SalaryLineDto], maxItems: MAX_LINES, example: [] })
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => SalaryLineDto)
  deductions: SalaryLineDto[];
}
