import { AppError } from '../../../shared/errors/app-error.js';

/* Pure business rules for candidates — no Nest, no Prisma. Unit-tested in candidate.rules.spec.ts.
   Rule ids refer to docs/modules/hiring.md. Source of behaviour: gs-hrms lib/hiringStore.ts (addCandidate,
   findDuplicates, updateCandidateTags, addCandidateNote) and components/hiring/HiringForms.tsx (CandidateForm). */

export const CANDIDATE_SOURCES = [
  'LINKEDIN',
  'NAUKRI',
  'BAYT',
  'INDEED',
  'EMPLOYEE_REFERRAL',
  'AGENCY',
  'CAREERS_PAGE',
  'DIRECT',
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const MAX_TAGS = 20;

const digits = (s: string) => s.replace(/\D/g, '');

/** The last nine digits identify a phone number whatever country code or spacing was typed (frontend `phoneKey`). */
export const phoneKey = (phone: string) => digits(phone).slice(-9);

/** What a duplicate is matched on: the lower-case email, and the phone key once it has 7 or more digits. */
export function duplicateKeys(email: string, phone: string): { email: string | null; phoneKey: string | null } {
  const e = email.trim().toLowerCase();
  const p = phoneKey(phone);
  return { email: e || null, phoneKey: p.length >= 7 ? p : null };
}

/** Trimmed, de-duplicated (case-insensitive, first spelling kept), at most MAX_TAGS. */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out = tags.map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  if (out.length > MAX_TAGS) throw new AppError('candidate.too_many_tags', `Use at most ${MAX_TAGS} tags`);
  return out;
}

export interface CandidateInputCheck {
  name: string;
  email: string;
  phone: string;
  source: CandidateSource;
  referrerId: string | null;
  agency: string | null;
  consent: boolean;
  tags: readonly string[];
}

export interface CheckedCandidate {
  name: string;
  email: string;
  phone: string;
  phoneKey: string;
  referrerId: string | null;
  agency: string | null;
  tags: string[];
}

/** BR-HIR-007: name, phone with ≥7 digits, consent; a referral names the referrer, an agency source the agency.
    Referrer and agency are dropped for other sources. Returns the normalised values. */
export function checkCandidateInput(i: CandidateInputCheck): CheckedCandidate {
  const name = i.name.replace(/\s+/g, ' ').trim();
  if (!name) throw new AppError('candidate.name_required', 'Name is required');
  const phone = i.phone.trim();
  if (digits(phone).length < 7) throw new AppError('candidate.invalid_phone', 'Enter a valid phone number');
  if (!i.consent) {
    throw new AppError('candidate.consent_required', 'Confirm the candidate has consented to their data being stored');
  }
  const referrerId = i.source === 'EMPLOYEE_REFERRAL' ? i.referrerId : null;
  if (i.source === 'EMPLOYEE_REFERRAL' && !referrerId) {
    throw new AppError('candidate.referrer_required', 'Choose the referring employee');
  }
  const agency = i.source === 'AGENCY' ? (i.agency?.trim() ?? '') : '';
  if (i.source === 'AGENCY' && !agency) throw new AppError('candidate.agency_required', 'Enter the agency name');
  return {
    name,
    email: i.email.trim().toLowerCase(),
    phone,
    phoneKey: phoneKey(phone),
    referrerId,
    agency: agency || null,
    tags: normaliseTags(i.tags),
  };
}
