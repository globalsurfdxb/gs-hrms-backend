import { AppError, conflict } from '../../../shared/errors/app-error.js';

/* Pure business rules for locations — no Nest, no Prisma. Unit-tested in location.rules.spec.ts.
   Rule ids refer to docs/modules/org.md. */

export interface LocationUsage {
  companies: number;
  departments: number;
  employees: number;
  requisitions: number;
  candidates: number;
}

/** BR-ORG-004: built-in locations are never deleted; a location still referenced anywhere cannot be deleted. */
export function assertLocationDeletable(location: { system: boolean }, usage: LocationUsage): void {
  if (location.system) throw conflict('location.system', 'Built-in locations cannot be deleted');
  const used = Object.entries(usage).filter(([, n]) => n > 0);
  if (used.length > 0) {
    throw new AppError(
      'location.in_use',
      `Location is used by ${used.map(([what, n]) => `${n} ${what}`).join(', ')}. Move them to another location first.`,
      409,
      { usage },
    );
  }
}

/** BR-ORG-008: the phone country code is "+" and 1–4 digits; spaces are ignored ("+ 971" → "+971"). */
export function normalisePhoneCode(input: string): string {
  const code = input.replace(/\s+/g, '');
  if (!/^\+\d{1,4}$/.test(code)) {
    throw new AppError('location.invalid_phone_code', 'Enter the phone country code, e.g. +966');
  }
  return code;
}

/** BR-ORG-009: seating entries are trimmed, blanks dropped, and must be unique ignoring case. */
export function normaliseSeating(input: string[]): string[] {
  const seats = input.map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const seat of seats) {
    const key = seat.toLowerCase();
    if (seen.has(key)) throw new AppError('location.duplicate_seat', `"${seat}" is already in the seating list`);
    seen.add(key);
  }
  return seats;
}

/** Currency is an ISO 4217 code known to the runtime ("AED", "INR"); stored upper-case. */
export function normaliseCurrency(input: string): string {
  const code = input.trim().toUpperCase();
  if (!Intl.supportedValuesOf('currency').includes(code)) {
    throw new AppError('location.invalid_currency', `Unknown currency "${input}"`);
  }
  return code;
}

/** Timezone is an IANA zone ("Asia/Dubai") — leave and attendance days are counted in it. */
export function assertTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new AppError('location.invalid_timezone', `Unknown timezone "${timezone}"`);
  }
  return timezone;
}

/** BR-ORG-010: the employee form rules (UAE / India) of a built-in location cannot change. */
export function assertTemplateChangeAllowed(location: { system: boolean; template: string }, template: string): void {
  if (location.system && location.template !== template) {
    throw conflict('location.system_template', 'The form rules of a built-in location cannot change');
  }
}

/** BR-ORG-011: ids are readable keys made from the city (or the name) — "Abu Dhabi" → "Abu-Dhabi" — never "Both"
    (it means "every location" for companies), and suffixed -2, -3 … when taken. `taken` is compared ignoring case. */
export function locationIdFor(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'Location';
  const used = new Set([...taken, 'Both'].map((id) => id.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id.toLowerCase())) return id;
  }
}
