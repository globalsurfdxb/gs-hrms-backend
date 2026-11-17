import { checkProfile } from './profile.rules.js';

const TODAY = '2026-11-12';

describe('employee profile rules', () => {
  it('BR-EMP-010: emergency contact groups follow the location template', () => {
    const uae = { emergencyContacts: [{ group: 'Local Emergency Contact (UAE)' }] };
    expect(checkProfile(uae, 'UAE', TODAY)).toEqual([]);
    expect(checkProfile(uae, 'INDIA', TODAY)).toEqual([
      expect.objectContaining({ field: 'emergencyContacts.0.group' }),
    ]);
    expect(checkProfile({ emergencyContacts: [{ group: 'Primary Emergency Contact' }] }, 'INDIA', TODAY)).toEqual([]);
  });

  it('dates and years run forwards; date of birth is in the past', () => {
    const problems = checkProfile(
      {
        dateOfBirth: TODAY,
        experience: [
          { fromDate: '2020-01-01', toDate: '2019-12-31' },
          { fromDate: '2020-01-01', toDate: null },
        ],
        education: [
          { startYear: 2015, endYear: 2012 },
          { startYear: 2015, endYear: 2018 },
        ],
      },
      'UAE',
      TODAY,
    );
    expect(problems.map((p) => p.field)).toEqual(['dateOfBirth', 'experience.0.toDate', 'education.0.endYear']);
  });
});
