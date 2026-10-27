import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertLocationDeletable,
  assertTemplateChangeAllowed,
  assertTimezone,
  locationIdFor,
  normaliseCurrency,
  normalisePhoneCode,
  normaliseSeating,
} from './location.rules.js';

const unused = { companies: 0, departments: 0, employees: 0, requisitions: 0, candidates: 0 };
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'not-an-app-error';
  }
  return undefined;
};

describe('BR-ORG-004 assertLocationDeletable', () => {
  it('allows an unused custom location', () => {
    expect(() => assertLocationDeletable({ system: false }, unused)).not.toThrow();
  });

  it('refuses a built-in location', () => {
    expect(codeOf(() => assertLocationDeletable({ system: true }, unused))).toBe('location.system');
  });

  it('refuses a location in use and reports the usage', () => {
    const usage = { ...unused, employees: 3 };
    expect(() => assertLocationDeletable({ system: false }, usage)).toThrow(
      expect.objectContaining({ code: 'location.in_use', status: 409, details: { usage } }),
    );
  });
});

describe('BR-ORG-008 normalisePhoneCode', () => {
  it('removes spaces', () => {
    expect(normalisePhoneCode(' + 966 ')).toBe('+966');
  });

  it.each(['966', '+', '+12345', '+9a', ''])('rejects %j', (v) => {
    expect(codeOf(() => normalisePhoneCode(v))).toBe('location.invalid_phone_code');
  });
});

describe('BR-ORG-009 normaliseSeating', () => {
  it('trims and drops blanks', () => {
    expect(normaliseSeating([' Office A ', '', '  ', 'Office B'])).toEqual(['Office A', 'Office B']);
  });

  it('rejects duplicates ignoring case', () => {
    expect(codeOf(() => normaliseSeating(['Office A', 'office a']))).toBe('location.duplicate_seat');
  });
});

describe('BR-ORG-010 assertTemplateChangeAllowed', () => {
  it('refuses a template change on a built-in location', () => {
    expect(codeOf(() => assertTemplateChangeAllowed({ system: true, template: 'UAE' }, 'INDIA'))).toBe(
      'location.system_template',
    );
  });

  it('allows the same template, and any change on a custom location', () => {
    expect(() => assertTemplateChangeAllowed({ system: true, template: 'UAE' }, 'UAE')).not.toThrow();
    expect(() => assertTemplateChangeAllowed({ system: false, template: 'UAE' }, 'INDIA')).not.toThrow();
  });
});

describe('BR-ORG-011 locationIdFor', () => {
  it('makes a readable id from the label', () => {
    expect(locationIdFor('Riyadh', [])).toBe('Riyadh');
    expect(locationIdFor(' Abu Dhabi ', [])).toBe('Abu-Dhabi');
    expect(locationIdFor('São Paulo', [])).toBe('Sao-Paulo');
  });

  it('suffixes a taken id, ignoring case', () => {
    expect(locationIdFor('Dubai', ['dubai', 'Dubai-2'])).toBe('Dubai-3');
  });

  it('never returns "Both" or an empty id', () => {
    expect(locationIdFor('both', [])).toBe('both-2');
    expect(locationIdFor('دبي', [])).toBe('Location');
  });
});

describe('currency and timezone', () => {
  it('accepts known values', () => {
    expect(normaliseCurrency(' sar ')).toBe('SAR');
    expect(assertTimezone('Asia/Riyadh')).toBe('Asia/Riyadh');
  });

  it('rejects unknown values', () => {
    expect(codeOf(() => normaliseCurrency('XYZQ'))).toBe('location.invalid_currency');
    expect(codeOf(() => assertTimezone('Mars/Olympus'))).toBe('location.invalid_timezone');
  });
});
