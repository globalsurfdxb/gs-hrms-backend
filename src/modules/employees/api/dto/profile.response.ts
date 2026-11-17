import { ApiProperty } from '@nestjs/swagger';
import { dayOf } from '../../../../shared/time/calendar-day.js';
import type { ProfileRecord } from '../../infrastructure/profiles.repository.js';

const day = (d: Date | null) => (d ? dayOf(d) : null);

export class EmergencyContactResponse {
  @ApiProperty({ example: 'Local Emergency Contact (UAE)' }) group: string;
  @ApiProperty({ example: 'Sam Example' }) name: string;
  @ApiProperty({ example: 'Spouse' }) relationship: string;
  @ApiProperty({ example: '+971 50 000 0000' }) mobile: string;
}

export class WorkExperienceResponse {
  @ApiProperty({ example: 'Example Systems LLC' }) company: string;
  @ApiProperty({ example: 'Dubai, UAE' }) location: string;
  @ApiProperty({ example: '2019-04-01', nullable: true, type: String }) fromDate: string | null;
  @ApiProperty({ example: '2023-02-28', nullable: true, type: String }) toDate: string | null;
  @ApiProperty({ example: 'Systems Engineer' }) title: string;
  @ApiProperty({ example: 'Onsite', description: 'Onsite | Remote | Hybrid, or "" when not given' }) workMode: string;
}

export class EducationResponse {
  @ApiProperty({ example: "Bachelor's Degree" }) qualification: string;
  @ApiProperty({ example: 'Example University' }) institution: string;
  @ApiProperty({ example: 'Bachelor of Technology' }) course: string;
  @ApiProperty({ example: 'Computer Science' }) field: string;
  @ApiProperty({ example: 2012, nullable: true, type: Number }) startYear: number | null;
  @ApiProperty({ example: 2016, nullable: true, type: Number }) endYear: number | null;
}

export class FamilyMemberResponse {
  @ApiProperty({ example: 'Alex Example' }) name: string;
  @ApiProperty({ example: 'Father' }) relationship: string;
  @ApiProperty({ example: 'Retired' }) occupation: string;
  @ApiProperty({ example: '1965-08-20', nullable: true, type: String }) dateOfBirth: string | null;
}

/* Personal details and lists. Explicit fields only; no identity, bank or salary values. null = not on file. */
export class ProfileResponse {
  @ApiProperty({ example: 'GS-087' }) employeeCode: string;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) middleName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
  @ApiProperty({ example: '1992-05-14', nullable: true, type: String }) dateOfBirth: string | null;
  @ApiProperty({ example: 'India', nullable: true, type: String }) nationality: string | null;
  @ApiProperty({ example: 'Female', nullable: true, type: String }) gender: string | null;
  @ApiProperty({ example: 'Married', nullable: true, type: String }) maritalStatus: string | null;
  @ApiProperty({ example: 'O+', nullable: true, type: String }) bloodGroup: string | null;
  @ApiProperty({ nullable: true, type: String }) personalEmail: string | null;
  @ApiProperty({ nullable: true, type: String }) personalMobile: string | null;
  @ApiProperty({ nullable: true, type: String }) currentAddress: string | null;
  @ApiProperty({ nullable: true, type: String }) permanentAddress: string | null;
  @ApiProperty({ nullable: true, type: String }) workPhone: string | null;
  @ApiProperty({ nullable: true, type: String }) extension: string | null;
  @ApiProperty({ nullable: true, type: String }) seatingLocation: string | null;
  @ApiProperty({ example: '2026-06-30', nullable: true, type: String }) probationEnd: string | null;
  @ApiProperty({ example: '4 yr 6 mo', nullable: true, type: String }) totalExperience: string | null;
  @ApiProperty({ type: [EmergencyContactResponse] }) emergencyContacts: EmergencyContactResponse[];
  @ApiProperty({ type: [WorkExperienceResponse] }) experience: WorkExperienceResponse[];
  @ApiProperty({ type: [EducationResponse] }) education: EducationResponse[];
  @ApiProperty({ type: [FamilyMemberResponse] }) family: FamilyMemberResponse[];
  @ApiProperty({ description: 'Whether you may change this profile (PATCH)' }) canEdit: boolean;

  static from(this: void, r: ProfileRecord, canEdit: boolean): ProfileResponse {
    const p = r.profile;
    return {
      employeeCode: r.employeeCode,
      firstName: p?.firstName ?? null,
      middleName: p?.middleName ?? null,
      lastName: p?.lastName ?? null,
      dateOfBirth: day(p?.dateOfBirth ?? null),
      nationality: p?.nationality ?? null,
      gender: p?.gender ?? null,
      maritalStatus: p?.maritalStatus ?? null,
      bloodGroup: p?.bloodGroup ?? null,
      personalEmail: p?.personalEmail ?? null,
      personalMobile: p?.personalMobile ?? null,
      currentAddress: p?.currentAddress ?? null,
      permanentAddress: p?.permanentAddress ?? null,
      workPhone: p?.workPhone ?? null,
      extension: p?.extension ?? null,
      seatingLocation: p?.seatingLocation ?? null,
      probationEnd: day(p?.probationEnd ?? null),
      totalExperience: p?.totalExperience ?? null,
      emergencyContacts: r.emergencyContacts.map((c) => ({
        group: c.group,
        name: c.name,
        relationship: c.relationship,
        mobile: c.mobile,
      })),
      experience: r.experience.map((x) => ({
        company: x.company,
        location: x.location,
        fromDate: day(x.fromDate),
        toDate: day(x.toDate),
        title: x.title,
        workMode: x.workMode,
      })),
      education: r.education.map((x) => ({
        qualification: x.qualification,
        institution: x.institution,
        course: x.course,
        field: x.field,
        startYear: x.startYear,
        endYear: x.endYear,
      })),
      family: r.family.map((x) => ({
        name: x.name,
        relationship: x.relationship,
        occupation: x.occupation,
        dateOfBirth: day(x.dateOfBirth),
      })),
      canEdit,
    };
  }
}
