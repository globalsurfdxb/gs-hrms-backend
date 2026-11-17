import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { employeeScopeOf } from '../../../core/iam/data-scope.js';
import { AppError, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay, dayOf, todayIn } from '../../../shared/time/calendar-day.js';
import { ProfileResponse } from '../api/dto/profile.response.js';
import type { UpdateProfileDto } from '../api/dto/update-profile.dto.js';
import { checkProfile } from '../domain/profile.rules.js';
import {
  ProfilesRepository,
  type ProfileData,
  type ProfileLists,
  type ProfileRecord,
} from '../infrastructure/profiles.repository.js';
import { assertCanEditEmployees, canEditEmployees } from './employee-access.js';

/** Text fields of the profile, in the order the audit lists them. */
const TEXT = [
  'firstName',
  'middleName',
  'lastName',
  'nationality',
  'gender',
  'maritalStatus',
  'bloodGroup',
  'personalEmail',
  'personalMobile',
  'currentAddress',
  'permanentAddress',
  'workPhone',
  'extension',
  'seatingLocation',
  'totalExperience',
] as const;
/** Calendar-day fields (YYYY-MM-DD in the API, DATE in the database). */
const DAYS = ['dateOfBirth', 'probationEnd'] as const;

const text = (v: string | null | undefined) => (v == null ? null : v.trim() || null);
const day = (d: Date | null | undefined) => (d ? dayOf(d) : null);
const optDay = (v: string | null | undefined) => (v ? dateOfDay(v) : null);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const names = (rows: { name: string }[]) => (rows.length ? rows.map((r) => r.name).join(', ') : 'none');
const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/* Employee profile: personal details, emergency contacts, experience, education and family (spec
   docs/modules/employees.md). Reads follow the caller's data scope; edits need Directory → Edit. Every save writes one
   audit row (module Employee) in the same transaction, listing only what changed. */
@Injectable()
export class ProfilesService {
  constructor(private readonly profiles: ProfilesRepository) {}

  async get(employeeCode: string, user: AuthUser): Promise<ProfileResponse> {
    const r = await this.profiles.findByCode(employeeScopeOf(user), employeeCode.toUpperCase());
    if (!r) throw notFound('employee');
    return ProfileResponse.from(r, canEditEmployees(user));
  }

  async update(employeeCode: string, dto: UpdateProfileDto, user: AuthUser): Promise<ProfileResponse> {
    assertCanEditEmployees(user);
    const r = await this.profiles.findByCode(employeeScopeOf(user, 'edit'), employeeCode.toUpperCase());
    if (!r) throw notFound('employee');

    const problems = checkProfile(dto, r.location.template, todayIn(r.location.timezone));
    if (problems.length) {
      throw new AppError('request.invalid', 'The profile has invalid values', 400, {
        fields: problems.map((p) => p.message),
        problems,
      });
    }

    const data: ProfileData = {};
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const p = r.profile;
    for (const k of TEXT) {
      if (dto[k] === undefined) continue;
      const next = text(dto[k]);
      const cur = p?.[k] ?? null;
      if (next === cur) continue;
      data[k] = next;
      before[k] = cur;
      after[k] = next;
    }
    for (const k of DAYS) {
      if (dto[k] === undefined) continue;
      const next = dto[k] || null;
      const cur = day(p?.[k]);
      if (next === cur) continue;
      data[k] = optDay(next);
      before[k] = cur;
      after[k] = next;
    }

    const lists: ProfileLists = {};
    const current = ProfileResponse.from(r, true);
    if (dto.emergencyContacts) {
      const rows = dto.emergencyContacts.map((c) => ({
        group: c.group,
        name: c.name.trim(),
        relationship: c.relationship.trim(),
        mobile: c.mobile.trim(),
      }));
      if (!same(rows, current.emergencyContacts)) {
        lists.emergencyContacts = rows;
        before.emergencyContacts = names(current.emergencyContacts);
        after.emergencyContacts = names(rows);
      }
    }
    if (dto.experience) {
      const rows = dto.experience.map((x) => ({
        company: x.company.trim(),
        location: text(x.location) ?? '',
        fromDate: x.fromDate ?? null,
        toDate: x.toDate ?? null,
        title: text(x.title) ?? '',
        workMode: x.workMode ?? '',
      }));
      if (!same(rows, current.experience)) {
        lists.experience = rows.map((x) => ({ ...x, fromDate: optDay(x.fromDate), toDate: optDay(x.toDate) }));
        before.experience = entries(current.experience.length);
        after.experience = entries(rows.length);
      }
    }
    if (dto.education) {
      const rows = dto.education.map((x) => ({
        qualification: x.qualification.trim(),
        institution: text(x.institution) ?? '',
        course: text(x.course) ?? '',
        field: text(x.field) ?? '',
        startYear: x.startYear ?? null,
        endYear: x.endYear ?? null,
      }));
      if (!same(rows, current.education)) {
        lists.education = rows;
        before.education = entries(current.education.length);
        after.education = entries(rows.length);
      }
    }
    if (dto.family) {
      const rows = dto.family.map((x) => ({
        name: x.name.trim(),
        relationship: x.relationship.trim(),
        occupation: text(x.occupation) ?? '',
        dateOfBirth: x.dateOfBirth ?? null,
      }));
      if (!same(rows, current.family)) {
        lists.family = rows.map((x) => ({ ...x, dateOfBirth: optDay(x.dateOfBirth) }));
        before.family = names(current.family);
        after.family = names(rows);
      }
    }

    // Nothing changed: no write and no audit row.
    if (!Object.keys(after).length) return ProfileResponse.from(r, true);

    const saved: ProfileRecord = await this.profiles.save(r.id, data, lists, { before, after }, actorOf(user));
    return ProfileResponse.from(saved, true);
  }
}
