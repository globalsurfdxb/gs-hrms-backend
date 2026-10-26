import { AppError } from '../../../shared/errors/app-error.js';
import {
  checkCandidateInput,
  duplicateKeys,
  normaliseTags,
  phoneKey,
  type CandidateInputCheck,
} from './candidate.rules.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'no error';
};

const ok: CandidateInputCheck = {
  name: '  Priya   Nair ',
  email: ' Priya.Nair@Example.com ',
  phone: '+971 50 123 4567',
  source: 'LINKEDIN',
  referrerId: null,
  agency: null,
  consent: true,
  tags: ['Shortlisted', ' shortlisted ', 'Fortinet NSE4', ''],
};

describe('BR-HIR-007 candidate input', () => {
  it('normalises name, email, phone key and tags', () => {
    expect(checkCandidateInput(ok)).toEqual({
      name: 'Priya Nair',
      email: 'priya.nair@example.com',
      phone: '+971 50 123 4567',
      phoneKey: '501234567',
      referrerId: null,
      agency: null,
      tags: ['Shortlisted', 'Fortinet NSE4'],
    });
  });

  it('needs a name, a phone with 7+ digits and consent', () => {
    expect(code(() => checkCandidateInput({ ...ok, name: '  ' }))).toBe('candidate.name_required');
    expect(code(() => checkCandidateInput({ ...ok, phone: '12-34-56' }))).toBe('candidate.invalid_phone');
    expect(code(() => checkCandidateInput({ ...ok, consent: false }))).toBe('candidate.consent_required');
  });

  it('needs the referrer for a referral and the agency for an agency source, and drops them otherwise', () => {
    expect(code(() => checkCandidateInput({ ...ok, source: 'EMPLOYEE_REFERRAL' }))).toBe('candidate.referrer_required');
    expect(code(() => checkCandidateInput({ ...ok, source: 'AGENCY', agency: ' ' }))).toBe('candidate.agency_required');
    expect(checkCandidateInput({ ...ok, source: 'AGENCY', agency: ' TalentHub ' }).agency).toBe('TalentHub');
    const direct = checkCandidateInput({ ...ok, source: 'DIRECT', referrerId: 'emp', agency: 'X' });
    expect(direct).toMatchObject({ referrerId: null, agency: null });
  });

  it('limits tags to 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(code(() => normaliseTags(many))).toBe('candidate.too_many_tags');
    expect(normaliseTags(many.slice(0, 20))).toHaveLength(20);
  });

  it('matches duplicates on the email and the last 9 phone digits (7+ digits only)', () => {
    expect(phoneKey('+91 98765 43210')).toBe('876543210');
    expect(duplicateKeys(' A@B.com ', '050 123 4567')).toEqual({ email: 'a@b.com', phoneKey: '501234567' });
    expect(duplicateKeys('', '12345')).toEqual({ email: null, phoneKey: null });
  });
});
