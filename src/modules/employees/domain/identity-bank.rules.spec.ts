import {
  checkIdentityBank,
  clearedByMove,
  ibanOk,
  normalise,
  type IdentityBankField,
  type IdentityBankState,
} from './identity-bank.rules.js';

const IBAN = 'AE220330000010000000001'; // fictional, valid checksum
const check = (next: IdentityBankState, template: 'UAE' | 'INDIA') =>
  checkIdentityBank(next, new Set(Object.keys(next) as IdentityBankField[]), template).map((p) => p.field);

describe('identity & bank rules', () => {
  it('normalises numbers: spaces removed and letters upper-cased, Emirates ID keeps its dashes', () => {
    expect(normalise('aadhaar', '1234 5678 9012')).toBe('123456789012');
    expect(normalise('pan', ' abcde1234f ')).toBe('ABCDE1234F');
    expect(normalise('accountNumber', 'ae22 0330 0000 1000 0000 001')).toBe(IBAN);
    expect(normalise('emiratesId', ' 784-1990-1234567-1 ')).toBe('784-1990-1234567-1');
  });

  it('BR-EMP-009: a UAE IBAN needs AE + 21 digits and a valid checksum', () => {
    expect(ibanOk(IBAN)).toBe(true);
    expect(ibanOk('AE230330000010000000001')).toBe(false);
    expect(ibanOk('AE2203300000100000000')).toBe(false);
    expect(check({ accountNumber: 'AE230330000010000000001', bankName: 'Example Bank' }, 'UAE')).toEqual([
      'accountNumber',
    ]);
    expect(check({ accountNumber: IBAN, bankName: 'Example Bank', paymentMode: 'WPS Transfer' }, 'UAE')).toEqual([]);
  });

  it('BR-EMP-009: an Indian account is 9 to 18 digits with an IFSC', () => {
    const ok = { accountNumber: '123456789012', bankName: 'Example Bank', branchCode: 'HDFC0001234' };
    expect(check(ok, 'INDIA')).toEqual([]);
    expect(check({ ...ok, accountNumber: '12345' }, 'INDIA')).toEqual(['accountNumber']);
    expect(check({ ...ok, branchCode: 'HDFC1234' }, 'INDIA')).toEqual(['branchCode']);
    expect(check({ ...ok, branchCode: null }, 'INDIA')).toEqual(['branchCode']);
    expect(check({ ...ok, bankName: null }, 'INDIA')).toEqual(['bankName']);
  });

  it('BR-EMP-001: the other country’s fields cannot be filled in; clearing them is fine', () => {
    expect(check({ aadhaar: '123456789012' }, 'UAE')).toEqual(['aadhaar']);
    expect(check({ emiratesId: '784-1990-1234567-1' }, 'INDIA')).toEqual(['emiratesId']);
    expect(check({ aadhaar: null, branchName: null }, 'UAE')).toEqual([]);
  });

  it('BR-EMP-008: Emirates ID, Aadhaar, PAN and UAN formats', () => {
    expect(check({ emiratesId: '784-1990-1234567-1' }, 'UAE')).toEqual([]);
    expect(check({ emiratesId: '784199012345671' }, 'UAE')).toEqual(['emiratesId']);
    expect(check({ aadhaar: '12345678901', pan: 'ABCD1234F', uan: '1234' }, 'INDIA')).toEqual([
      'aadhaar',
      'pan',
      'uan',
    ]);
    expect(check({ aadhaar: '123456789012', pan: 'ABCDE1234F', uan: '100200300400' }, 'INDIA')).toEqual([]);
  });

  it('BR-EMP-001: payment modes follow the location', () => {
    expect(check({ paymentMode: 'Cheque' }, 'UAE')).toEqual(['paymentMode']);
    expect(check({ paymentMode: 'WPS Transfer' }, 'INDIA')).toEqual(['paymentMode']);
    expect(check({ paymentMode: 'Cheque' }, 'INDIA')).toEqual([]);
  });

  it('the passport number is required for UAE only and must look like one', () => {
    expect(check({ passportNumber: null }, 'UAE')).toEqual(['passportNumber']);
    expect(check({ passportNumber: null }, 'INDIA')).toEqual([]);
    expect(check({ passportNumber: 'P-1' }, 'INDIA')).toEqual(['passportNumber']);
  });

  it('BR-EMP-008: PF enrolled = Yes needs the UAN and its linked mobile', () => {
    expect(check({ pfEnrolled: 'Yes' }, 'INDIA')).toEqual(['uan', 'uanMobile']);
    expect(check({ pfEnrolled: 'Yes', uan: '100200300400', uanMobile: '+91 98765 43210' }, 'INDIA')).toEqual([]);
    expect(check({ pfEnrolled: 'No' }, 'INDIA')).toEqual([]);
  });

  it('formats are checked only for fields the save changes', () => {
    // A stored account that no longer passes the rules does not block a name change.
    const state = { accountNumber: 'OLD-VALUE', bankName: 'Example Bank', accountName: 'Sam Example' };
    expect(checkIdentityBank(state, new Set(['accountName']), 'UAE')).toEqual([]);
  });

  it('labour card expiry cannot be before the issue date', () => {
    expect(check({ labourCardIssue: '2025-05-01', labourCardExpiry: '2025-04-01' }, 'UAE')).toEqual([
      'labourCardExpiry',
    ]);
  });

  it('BR-EMP-001: a move clears the other country’s fields and the bank details, never the passport', () => {
    const toIndia = clearedByMove('INDIA');
    expect(toIndia).toEqual(expect.arrayContaining(['emiratesId', 'visaExpiry', 'accountNumber', 'paymentMode']));
    expect(toIndia).not.toContain('aadhaar');
    expect(toIndia).not.toContain('passportNumber');
    expect(clearedByMove('UAE')).toEqual(expect.arrayContaining(['aadhaar', 'uan', 'branchName', 'accountNumber']));
  });
});
