import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EPS_ELIGIBILITY, PF_ENROLLED, SECRET_FIELDS } from '../../domain/identity-bank.rules.js';

/** A blank field means "not on file": the form sends "" for an empty input. */
const BlankIsNull = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : value));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MSG = { message: '$property must be YYYY-MM-DD' };
/** Same rule as the frontend `phoneOk`. */
const PHONE = /^(?=(?:\D*\d){7,15}\D*$)[+\d][\d\s\-()]*$/;

const Text = (max: number, example: string, description?: string) => (target: object, key: string) => {
  ApiPropertyOptional({ example, nullable: true, description })(target, key);
  BlankIsNull()(target, key);
  IsOptional()(target, key);
  IsString()(target, key);
  MaxLength(max)(target, key);
};
const Day = (example: string) => (target: object, key: string) => {
  ApiPropertyOptional({ example, nullable: true })(target, key);
  BlankIsNull()(target, key);
  IsOptional()(target, key);
  Matches(DAY, DAY_MSG)(target, key);
};

/* PATCH /employees/:code/identity-bank. A field left out stays; "" or null clears it. Numbers are checked after
   spaces are removed (formats and which fields the location keeps: identity-bank.rules.ts). Nothing here changes
   who the person is or what they may do — those are separate endpoints. */
export class UpdateIdentityBankDto {
  @Text(20, 'N1234567', 'Required for UAE employees. Stored encrypted.')
  passportNumber?: string | null;

  @Day('2030-06-30')
  passportExpiry?: string | null;

  @Text(120, 'Sam Example', 'India only')
  passportName?: string | null;

  @Text(18, '784-1990-1234567-1', 'UAE only. 784-YYYY-NNNNNNN-N. Stored encrypted.')
  emiratesId?: string | null;

  @Day('2027-03-31')
  emiratesIdExpiry?: string | null;

  @Day('2027-03-31')
  visaExpiry?: string | null;

  @Day('2025-04-01')
  labourCardIssue?: string | null;

  @Day('2027-03-31')
  labourCardExpiry?: string | null;

  @Text(14, '1234 5678 9012', 'India only. 12 digits. Stored encrypted.')
  aadhaar?: string | null;

  @Text(120, 'Sam Example', 'India only')
  aadhaarName?: string | null;

  @Text(10, 'ABCDE1234F', 'India only. Stored encrypted.')
  pan?: string | null;

  @Text(120, 'Sam Example', 'India only')
  panName?: string | null;

  @Text(14, '100200300400', 'India only. 12 digits. Stored encrypted.')
  uan?: string | null;

  @ApiPropertyOptional({ enum: PF_ENROLLED, nullable: true, description: 'India only' })
  @BlankIsNull()
  @IsOptional()
  @IsIn(PF_ENROLLED)
  pfEnrolled?: string | null;

  @ApiPropertyOptional({ example: '+91 98765 43210', nullable: true, description: 'India only' })
  @BlankIsNull()
  @IsOptional()
  @Matches(PHONE, { message: '$property must be a phone number (7–15 digits)' })
  uanMobile?: string | null;

  @Text(30, 'KN/KCH/0012345/000/0000123', 'India only')
  pfMemberId?: string | null;

  @ApiPropertyOptional({ enum: EPS_ELIGIBILITY, nullable: true, description: 'India only' })
  @BlankIsNull()
  @IsOptional()
  @IsIn(EPS_ELIGIBILITY)
  epsEligibility?: string | null;

  @Text(20, 'WPS Transfer', 'UAE: WPS Transfer | Bank Transfer. India: Bank Transfer | Cheque.')
  paymentMode?: string | null;

  @Text(80, 'Example Bank')
  bankName?: string | null;

  @Text(120, 'Sam Example')
  accountName?: string | null;

  @Text(40, 'AE22 0330 0000 1000 0000 001', 'UAE: IBAN. India: 9–18 digits. Stored encrypted.')
  accountNumber?: string | null;

  @Text(20, 'HDFC0001234', 'India: IFSC (required with an account). UAE: routing / bank code.')
  branchCode?: string | null;

  @Text(80, 'Kochi Main', 'India only')
  branchName?: string | null;
}

export class RevealNumberDto {
  @ApiProperty({ enum: SECRET_FIELDS, example: 'passportNumber' })
  @IsIn(SECRET_FIELDS)
  field: (typeof SECRET_FIELDS)[number];
}
