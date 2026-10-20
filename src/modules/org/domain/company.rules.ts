import { AppError } from '../../../shared/errors/app-error.js';

/* Pure business rules for companies — no Nest, no Prisma. Unit-tested in company.rules.spec.ts.
   Rule ids refer to docs/modules/org.md. */

/** BR-ORG-001: short codes are 2–8 upper-case letters/digits ("GSIT", "GSD"). */
export function normaliseShortCode(input: string): string {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    throw new AppError('company.invalid_short_code', 'Short code must be 2–8 letters or digits');
  }
  return code;
}

/** BR-ORG-002: the frontend's "Both" means the company operates in every location (stored as null). */
export const locationIdFromInput = (location: string): string | null => (location === 'Both' ? null : location);
export const locationIdToOutput = (locationId: string | null): string => locationId ?? 'Both';
