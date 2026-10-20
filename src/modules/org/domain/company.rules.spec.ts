import { AppError } from '../../../shared/errors/app-error.js';
import { locationIdFromInput, locationIdToOutput, normaliseShortCode } from './company.rules.js';

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
