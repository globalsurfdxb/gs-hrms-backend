import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CANDIDATE_SOURCES, type CandidateSource } from '../../domain/candidate.rules.js';
import type { CandidateDetailRecord, CandidateRecord } from '../../infrastructure/candidates.repository.js';
import { ApplicationSummaryResponse, StageChangeResponse, stageChange } from './application.response.js';
import { MoneyResponse, PersonRefResponse, person, RefResponse } from './common.response.js';

/* Explicit response shapes for candidates. Never return Prisma records directly. Salary is left out entirely
   (not null, absent) unless the caller may see it (spec §6, Q8); `viewer.canSeeSalary` says which. */

export class CandidateResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Priya Nair' }) name: string;
  @ApiProperty({ example: 'priya.nair@example.com' }) email: string;
  @ApiProperty({ example: '+971 50 123 4567' }) phone: string;
  @ApiProperty({ type: RefResponse, description: 'id is the location id, e.g. Dubai' }) location: RefResponse;
  @ApiProperty({ example: 'Emirates Networks LLC' }) currentCompany: string;
  @ApiProperty({ example: 'Network Engineer' }) currentTitle: string;
  @ApiProperty({ example: 4.5 }) experienceYears: number;
  @ApiProperty({ enum: CANDIDATE_SOURCES }) source: CandidateSource;
  @ApiProperty({ type: [String], example: ['Shortlisted'] }) tags: string[];
  @ApiProperty({ type: [ApplicationSummaryResponse], description: 'Newest first' })
  applications: ApplicationSummaryResponse[];
  @ApiProperty() createdAt: string;

  static from(this: void, c: CandidateRecord): CandidateResponse {
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      location: c.location,
      currentCompany: c.currentCompany,
      currentTitle: c.currentTitle,
      experienceYears: c.experienceYears.toNumber(),
      source: c.source,
      tags: c.tags,
      applications: c.applications.map(ApplicationSummaryResponse.from),
      createdAt: c.createdAt.toISOString(),
    };
  }
}

export class CandidateListResponse {
  @ApiProperty({ type: [CandidateResponse] }) items: CandidateResponse[];
  @ApiProperty({ example: 120 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}

export class CandidateNoteResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Asked for 45 days notice.' }) text: string;
  @ApiProperty({ type: PersonRefResponse }) by: PersonRefResponse;
  @ApiProperty() at: string;
}

export class CandidateApplicationResponse extends ApplicationSummaryResponse {
  @ApiProperty({ type: [StageChangeResponse], description: 'Oldest first' }) history: StageChangeResponse[];
}

export class CandidateViewerResponse {
  @ApiProperty({ description: 'Tags, notes, pipeline moves (Candidates → Edit)' }) canEdit: boolean;
  @ApiProperty({ description: 'Add to another job (Candidates → Add)' }) canAddApplication: boolean;
  @ApiProperty({ description: 'Salary fields are included' }) canSeeSalary: boolean;
}

export class CandidateDetailResponse extends CandidateResponse {
  @ApiProperty({ example: 'Dubai' }) currentCity: string;
  @ApiProperty({ example: 30 }) noticeDays: number;
  @ApiPropertyOptional({ type: MoneyResponse, nullable: true, description: 'Only with salary access' })
  currentSalary?: MoneyResponse | null;
  @ApiPropertyOptional({ type: MoneyResponse, nullable: true, description: 'Only with salary access' })
  expectedSalary?: MoneyResponse | null;
  @ApiProperty({ example: 'Employment visa (transferable)' }) visaStatus: string;
  @ApiProperty({ type: PersonRefResponse, nullable: true }) referrer: PersonRefResponse | null;
  @ApiProperty({ example: 'TalentHub', nullable: true }) agency: string | null;
  @ApiProperty({ example: 'Priya_Nair_CV.pdf', nullable: true, description: 'File name only (no file stored yet)' })
  cvName: string | null;
  @ApiProperty({ example: 'linkedin.com/in/priya-nair' }) links: string;
  @ApiProperty({ example: '2026-10-26T08:00:00.000Z' }) consentGivenAt: string;
  @ApiProperty({ type: [CandidateNoteResponse], description: 'Newest first' }) notes: CandidateNoteResponse[];
  @ApiProperty({ type: [CandidateApplicationResponse], description: 'Newest first' })
  declare applications: CandidateApplicationResponse[];
  @ApiProperty({ type: PersonRefResponse }) createdBy: PersonRefResponse;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: CandidateViewerResponse }) viewer: CandidateViewerResponse;

  static fromDetail(this: void, c: CandidateDetailRecord, viewer: CandidateViewerResponse): CandidateDetailResponse {
    const money = (v: { toFixed(n: number): string } | null) =>
      v ? { amount: v.toFixed(2), currency: c.currency } : null;
    return {
      ...CandidateResponse.from(c),
      currentCity: c.currentCity,
      noticeDays: c.noticeDays,
      ...(viewer.canSeeSalary && { currentSalary: money(c.currentSalary), expectedSalary: money(c.expectedSalary) }),
      visaStatus: c.visaStatus,
      referrer: c.referrer ? person(c.referrer) : null,
      agency: c.agency,
      cvName: c.cvName,
      links: c.links,
      consentGivenAt: c.consentGivenAt.toISOString(),
      notes: c.notes.map((n) => ({ id: n.id, text: n.text, by: person(n.author), at: n.at.toISOString() })),
      applications: c.applications.map((a) => ({
        ...ApplicationSummaryResponse.from(a),
        history: a.history.map(stageChange),
      })),
      createdBy: person(c.createdBy),
      updatedAt: c.updatedAt.toISOString(),
      viewer,
    };
  }
}

export class DuplicateCandidateResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Priya Nair' }) name: string;
  @ApiProperty({ example: 'priya.nair@example.com' }) email: string;
  @ApiProperty({ example: '+971 50 123 4567' }) phone: string;
}
