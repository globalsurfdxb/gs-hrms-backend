import { ApiProperty } from '@nestjs/swagger';
import { SECRET_FIELDS, type SecretField } from '../../domain/identity-bank.rules.js';

const n = (example: string, description?: string) =>
  ApiProperty({ type: String, nullable: true, example, ...(description ? { description } : {}) });
const MASKED = 'Masked to the last 4 characters; POST …/identity-bank/reveal returns the full number.';

/** Plain values of the record (dates as YYYY-MM-DD); secrets already decrypted and masked by the service. */
export interface IdentityBankView {
  employeeCode: string;
  template: 'UAE' | 'INDIA';
  currency: 'AED' | 'INR';
  masked: Record<SecretField, string | null>;
  values: Omit<IdentityBankResponse, 'employeeCode' | 'template' | 'currency' | SecretField | 'canEdit' | 'canReveal'>;
  canEdit: boolean;
  canReveal: boolean;
}

/* Identity, bank and PF details of one employee. Numbers are never returned whole here. */
export class IdentityBankResponse {
  @ApiProperty({ example: 'GS-087' }) employeeCode: string;
  @ApiProperty({ enum: ['UAE', 'INDIA'], description: 'Which fields apply (BR-EMP-001)' }) template: 'UAE' | 'INDIA';
  @ApiProperty({ enum: ['AED', 'INR'], description: 'Set by the work location' }) currency: 'AED' | 'INR';

  @n('••••4567', MASKED) passportNumber: string | null;
  @n('2030-06-30') passportExpiry: string | null;
  @n('Sam Example') passportName: string | null;

  @n('••••••••••••••67-1', MASKED) emiratesId: string | null;
  @n('2027-03-31') emiratesIdExpiry: string | null;
  @n('2027-03-31') visaExpiry: string | null;
  @n('2025-04-01') labourCardIssue: string | null;
  @n('2027-03-31') labourCardExpiry: string | null;

  @n('••••••••9012', MASKED) aadhaar: string | null;
  @n('Sam Example') aadhaarName: string | null;
  @n('••••••234F', MASKED) pan: string | null;
  @n('Sam Example') panName: string | null;
  @n('••••••••0400', MASKED) uan: string | null;
  @n('Yes') pfEnrolled: string | null;
  @n('+91 98765 43210') uanMobile: string | null;
  @n('KN/KCH/0012345/000/0000123') pfMemberId: string | null;
  @n('Eligible') epsEligibility: string | null;

  @n('WPS Transfer') paymentMode: string | null;
  @n('Example Bank') bankName: string | null;
  @n('Sam Example') accountName: string | null;
  @n('•••••••••••••••••••0001', MASKED) accountNumber: string | null;
  @n('HDFC0001234') branchCode: string | null;
  @n('Kochi Main') branchName: string | null;

  @ApiProperty({ description: 'Whether you may change these details' }) canEdit: boolean;
  @ApiProperty({ description: 'Whether you may reveal a full number (each reveal is audited)' }) canReveal: boolean;

  static from(v: IdentityBankView): IdentityBankResponse {
    const r = new IdentityBankResponse();
    r.employeeCode = v.employeeCode;
    r.template = v.template;
    r.currency = v.currency;
    for (const f of SECRET_FIELDS) r[f] = v.masked[f];
    r.passportExpiry = v.values.passportExpiry;
    r.passportName = v.values.passportName;
    r.emiratesIdExpiry = v.values.emiratesIdExpiry;
    r.visaExpiry = v.values.visaExpiry;
    r.labourCardIssue = v.values.labourCardIssue;
    r.labourCardExpiry = v.values.labourCardExpiry;
    r.aadhaarName = v.values.aadhaarName;
    r.panName = v.values.panName;
    r.pfEnrolled = v.values.pfEnrolled;
    r.uanMobile = v.values.uanMobile;
    r.pfMemberId = v.values.pfMemberId;
    r.epsEligibility = v.values.epsEligibility;
    r.paymentMode = v.values.paymentMode;
    r.bankName = v.values.bankName;
    r.accountName = v.values.accountName;
    r.branchCode = v.values.branchCode;
    r.branchName = v.values.branchName;
    r.canEdit = v.canEdit;
    r.canReveal = v.canReveal;
    return r;
  }
}

export class RevealedNumberResponse {
  @ApiProperty({ enum: SECRET_FIELDS, example: 'passportNumber' }) field: SecretField;
  @ApiProperty({ example: 'N1234567', description: 'The full number. Do not cache or log it.' }) value: string;
}
