/* Employee profile rules (spec docs/modules/employees.md). Pure — no Nest, no Prisma. */

export type LocationTemplate = 'UAE' | 'INDIA';

/** Fixed lists from the frontend (lib/options.ts). */
export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'] as const;
export const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as const;
export const WORK_MODES = ['Onsite', 'Remote', 'Hybrid'] as const;

/** BR-EMP-010: emergency contact groups follow the work location's template (frontend lib/profiles.ts). */
export const EMERGENCY_GROUPS: Record<LocationTemplate, readonly string[]> = {
  UAE: ['Local Emergency Contact (UAE)', 'Home Country Emergency Contact'],
  INDIA: ['Primary Emergency Contact', 'Alternate Emergency Contact'],
};
export const ALL_EMERGENCY_GROUPS = [...EMERGENCY_GROUPS.UAE, ...EMERGENCY_GROUPS.INDIA];

export interface ProfileProblem {
  field: string;
  message: string;
}

export interface ProfileListsInput {
  emergencyContacts?: { group: string }[];
  experience?: { fromDate?: string | null; toDate?: string | null }[];
  education?: { startYear?: number | null; endYear?: number | null }[];
}

/** Cross-field checks the DTOs cannot express. `today` is YYYY-MM-DD. */
export function checkProfile(
  input: ProfileListsInput & { dateOfBirth?: string | null },
  template: LocationTemplate,
  today: string,
): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  if (input.dateOfBirth && input.dateOfBirth >= today) {
    out.push({ field: 'dateOfBirth', message: 'Date of birth must be in the past' });
  }
  input.emergencyContacts?.forEach((c, i) => {
    if (!EMERGENCY_GROUPS[template].includes(c.group)) {
      out.push({
        field: `emergencyContacts.${i}.group`,
        message: `Contact group must be one of: ${EMERGENCY_GROUPS[template].join(', ')}`,
      });
    }
  });
  input.experience?.forEach((x, i) => {
    if (x.fromDate && x.toDate && x.toDate < x.fromDate) {
      out.push({ field: `experience.${i}.toDate`, message: 'Experience must end after it starts' });
    }
  });
  input.education?.forEach((x, i) => {
    if (x.startYear != null && x.endYear != null && x.endYear < x.startYear) {
      out.push({ field: `education.${i}.endYear`, message: 'Education must end after it starts' });
    }
  });
  return out;
}
