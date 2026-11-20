/* Identity, bank and PF rules (spec docs/modules/employees.md, BR-EMP-001/008/009). Pure — no Nest, no Prisma.
   Format rules match the frontend (lib/options.ts, app/directory/[code]/edit validate()). */

import type { LocationTemplate } from './profile.rules.js';

/** Numbers stored encrypted and returned masked unless the caller may reveal them. */
export const SECRET_FIELDS = ['passportNumber', 'emiratesId', 'aadhaar', 'pan', 'uan', 'accountNumber'] as const;
/** Plain text fields. */
export const TEXT_FIELDS = [
  'passportName',
  'aadhaarName',
  'panName',
  'pfEnrolled',
  'uanMobile',
  'pfMemberId',
  'epsEligibility',
  'paymentMode',
  'bankName',
  'accountName',
  'branchCode',
  'branchName',
] as const;
/** Calendar days (YYYY-MM-DD). */
export const DAY_FIELDS = [
  'passportExpiry',
  'emiratesIdExpiry',
  'visaExpiry',
  'labourCardIssue',
  'labourCardExpiry',
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];
export type IdentityBankField = SecretField | (typeof TEXT_FIELDS)[number] | (typeof DAY_FIELDS)[number];
export const ALL_FIELDS: readonly IdentityBankField[] = [...SECRET_FIELDS, ...TEXT_FIELDS, ...DAY_FIELDS];

/** BR-EMP-001: fields that only one location template keeps (frontend UAE_ONLY / INDIA_ONLY). */
export const ONLY: Record<LocationTemplate, readonly IdentityBankField[]> = {
  UAE: ['emiratesId', 'emiratesIdExpiry', 'visaExpiry', 'labourCardIssue', 'labourCardExpiry'],
  INDIA: [
    'passportName',
    'aadhaar',
    'aadhaarName',
    'pan',
    'panName',
    'uan',
    'pfEnrolled',
    'uanMobile',
    'pfMemberId',
    'epsEligibility',
    'branchName',
  ],
};
/** Bank details are country-specific too (IBAN vs account number + IFSC), so a move clears them. */
export const BANK_FIELDS: readonly IdentityBankField[] = [
  'paymentMode',
  'bankName',
  'accountName',
  'accountNumber',
  'branchCode',
  'branchName',
];

export const PAYMENT_MODES: Record<LocationTemplate, readonly string[]> = {
  UAE: ['WPS Transfer', 'Bank Transfer'],
  INDIA: ['Bank Transfer', 'Cheque'],
};
export const PF_ENROLLED = ['Yes', 'No'] as const;
export const EPS_ELIGIBILITY = ['Eligible', 'Not eligible', 'Not sure'] as const;
export const CURRENCY: Record<LocationTemplate, 'AED' | 'INR'> = { UAE: 'AED', INDIA: 'INR' };

/** Readable names for messages and the audit log. */
export const LABELS: Record<IdentityBankField, string> = {
  passportNumber: 'Passport number',
  passportExpiry: 'Passport expiry',
  passportName: 'Name as per passport',
  emiratesId: 'Emirates ID',
  emiratesIdExpiry: 'Emirates ID expiry',
  visaExpiry: 'Visa expiry',
  labourCardIssue: 'Labour card issue date',
  labourCardExpiry: 'Labour card expiry',
  aadhaar: 'Aadhaar number',
  aadhaarName: 'Name as per Aadhaar',
  pan: 'PAN',
  panName: 'Name as per PAN',
  uan: 'UAN',
  pfEnrolled: 'Already enrolled in PF',
  uanMobile: 'Mobile linked to UAN',
  pfMemberId: 'Previous PF member ID',
  epsEligibility: 'EPS eligibility',
  paymentMode: 'Payment mode',
  bankName: 'Bank name',
  accountName: 'Account holder name',
  accountNumber: 'Account number / IBAN',
  branchCode: 'IFSC / routing code',
  branchName: 'Branch name',
};

const TEMPLATE_NAME: Record<LocationTemplate, string> = { UAE: 'UAE', INDIA: 'India' };

/** The stored form of a number: separators the person may type are removed, letters upper-cased. Emirates ID keeps
    its dashes because its format includes them. */
export const normalise = (field: SecretField, value: string): string =>
  field === 'emiratesId' ? value.trim() : value.replace(/\s/g, '').toUpperCase();

export const EMIRATES_ID = /^784-\d{4}-\d{7}-\d$/;
export const AADHAAR = /^\d{12}$/;
export const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const UAN = /^\d{12}$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const INDIA_ACCOUNT = /^\d{9,18}$/;
export const PASSPORT = /^[A-Z0-9]{5,20}$/;

/** UAE IBAN: AE + 21 digits with a valid ISO 13616 mod-97 checksum (frontend `ibanError`). */
export function ibanOk(iban: string): boolean {
  if (!/^AE\d{21}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = ch >= 'A' ? ch.charCodeAt(0) - 55 : Number(ch);
    rem = (rem * (v >= 10 ? 100 : 10) + v) % 97;
  }
  return rem === 1;
}

export interface IdentityBankProblem {
  field: IdentityBankField;
  message: string;
}

/** The record after the save: a value, or null when not on file. Unchanged secrets only need to show presence. */
export type IdentityBankState = Partial<Record<IdentityBankField, string | null>>;

/**
 * Checks a save. `changed` lists the fields the request sets (already normalised in `next`); formats are checked
 * only for those, so an older stored value never blocks an unrelated edit. Presence rules use the whole state.
 */
export function checkIdentityBank(
  next: IdentityBankState,
  changed: ReadonlySet<IdentityBankField>,
  template: LocationTemplate,
): IdentityBankProblem[] {
  const out: IdentityBankProblem[] = [];
  const add = (field: IdentityBankField, message: string) => out.push({ field, message });
  const set = (f: IdentityBankField) => changed.has(f) && next[f] != null;
  const other: LocationTemplate = template === 'UAE' ? 'INDIA' : 'UAE';

  // BR-EMP-001: the other country's fields cannot be filled in.
  for (const f of ONLY[other]) {
    if (set(f)) add(f, `${LABELS[f]} is not used for ${TEMPLATE_NAME[template]} employees`);
  }

  // Formats (BR-EMP-008, BR-EMP-009).
  if (set('passportNumber') && !PASSPORT.test(next.passportNumber!)) {
    add('passportNumber', 'Passport number is 5 to 20 letters or digits');
  }
  if (set('emiratesId') && !EMIRATES_ID.test(next.emiratesId!)) {
    add('emiratesId', 'Emirates ID format is 784-YYYY-NNNNNNN-N');
  }
  if (set('aadhaar') && !AADHAAR.test(next.aadhaar!)) add('aadhaar', 'Aadhaar is 12 digits');
  if (set('pan') && !PAN.test(next.pan!)) add('pan', 'PAN looks like ABCDE1234F');
  if (set('uan') && !UAN.test(next.uan!)) add('uan', 'UAN is 12 digits');
  if (template === 'UAE' && changed.has('passportNumber') && next.passportNumber == null) {
    add('passportNumber', 'Passport number is required for UAE employees');
  }
  if (set('paymentMode') && !PAYMENT_MODES[template].includes(next.paymentMode!)) {
    add('paymentMode', `Payment mode must be one of: ${PAYMENT_MODES[template].join(', ')}`);
  }
  if (set('accountNumber')) {
    const v = next.accountNumber!;
    if (template === 'UAE' && !ibanOk(v)) {
      add('accountNumber', 'IBAN must be AE + 21 digits with a valid checksum');
    }
    if (template === 'INDIA' && !INDIA_ACCOUNT.test(v)) add('accountNumber', 'Account number is 9 to 18 digits');
  }
  if (template === 'INDIA' && set('branchCode') && !IFSC.test(next.branchCode!)) {
    add('branchCode', 'IFSC looks like HDFC0001234 (4 letters, 0, then 6 letters or digits)');
  }

  // Completeness of what is on file after the save.
  if (next.accountNumber != null) {
    if (next.bankName == null) add('bankName', 'Bank name is required with an account number');
    if (template === 'INDIA' && next.branchCode == null) add('branchCode', 'IFSC is required with an account number');
  }
  if (template === 'INDIA' && next.pfEnrolled === 'Yes') {
    if (next.uan == null) add('uan', 'UAN is required when already enrolled in PF');
    if (next.uanMobile == null) add('uanMobile', 'The mobile linked to the UAN is required when enrolled in PF');
  }
  if (next.labourCardIssue && next.labourCardExpiry && next.labourCardExpiry < next.labourCardIssue) {
    add('labourCardExpiry', 'Labour card expiry is before the issue date');
  }
  return out;
}

/** BR-EMP-001: what a move to `to` clears — the other country's fields and the bank details (formats differ). */
export const clearedByMove = (to: LocationTemplate): IdentityBankField[] => [
  ...new Set([...ONLY[to === 'UAE' ? 'INDIA' : 'UAE'], ...BANK_FIELDS]),
];
