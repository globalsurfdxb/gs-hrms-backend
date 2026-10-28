import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertCompanyDeletable,
  locationIdFromInput,
  locationIdToOutput,
  normaliseShortCode,
} from './company.rules.js';

describe('BR-ORG-001 normaliseShortCode', () => {
  it('upper-cases and trims', () => {
    expect(normaliseShortCode(' gsit ')).toBe('GSIT');
  });

  it.each(['G', 'TOOLONGCODE', 'GS-IT', ''])('rejects %j', (v) => {
    expect(() => normaliseShortCode(v)).toThrow(AppError);
  });
});

describe('BR-ORG-002 location mapping', () => {
  it('maps "Both" to null and back', () => {
    expect(locationIdFromInput('Both')).toBeNull();
    expect(locationIdToOutput(null)).toBe('Both');
    expect(locationIdFromInput('Dubai')).toBe('Dubai');
  });
});

describe('BR-ORG-005 assertCompanyDeletable', () => {
  const unused = { employees: 0, requisitions: 0, jobs: 0 };

  it('allows an unused company', () => {
    expect(() => assertCompanyDeletable(unused)).not.toThrow();
  });

  it('refuses a company in use and reports the usage', () => {
    const usage = { ...unused, jobs: 1 };
    expect(() => assertCompanyDeletable(usage)).toThrow(
      expect.objectContaining({ code: 'company.in_use', status: 409, details: { usage } }),
    );
  });
});
