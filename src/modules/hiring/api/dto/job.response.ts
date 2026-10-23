import { ApiProperty } from '@nestjs/swagger';
import { dayOf } from '../../../../shared/time/calendar-day.js';
import { allowedJobActions, type JobAction } from '../../domain/job.rules.js';
import type { JobDetailRecord, JobRecord } from '../../infrastructure/jobs.repository.js';
import { MoneyResponse, PersonRefResponse, person, RefResponse } from './common.response.js';
import { EMPLOYMENT_TYPES } from './create-requisition.dto.js';
import { JOB_STATUSES } from './list-jobs.query.js';

/* Explicit response shapes. Never return Prisma records directly. Budget is shown: only recruiting users
   (Jobs → View: HR, Super Admin) reach these routes. */

export class JobRequisitionRefResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'REQ-0001' }) code: string;
}

export class JobEventResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: '2026-10-22T08:00:00.000Z' }) at: string;
  @ApiProperty({ example: 'Dev HR', description: 'Name at the time, or "system"' }) by: string;
  @ApiProperty({ example: 'Status changed from Open to On Hold' }) text: string;
}

export class JobViewerResponse {
  @ApiProperty({
    enum: ['open', 'hold', 'resume', 'close', 'reopen'],
    isArray: true,
    description: 'Status actions allowed now (empty for FILLED)',
  })
  actions: JobAction[];
  @ApiProperty({ description: 'Change the recruiter (Jobs → Edit)' }) canChangeRecruiter: boolean;
}

export class JobResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'JOB-0001' }) code: string;
  @ApiProperty({ type: JobRequisitionRefResponse }) requisition: JobRequisitionRefResponse;
  @ApiProperty({ example: 'Network Engineer' }) title: string;
  @ApiProperty({ type: RefResponse }) company: RefResponse;
  @ApiProperty({ type: RefResponse }) department: RefResponse;
  @ApiProperty({ type: RefResponse, nullable: true, description: 'name = designation title' })
  designation: RefResponse | null;
  @ApiProperty({ type: RefResponse, description: 'id is the location id, e.g. Dubai' }) location: RefResponse;
  @ApiProperty({ example: 2 }) positions: number;
  @ApiProperty({ example: 0, description: 'Accepted offers counted against positions' }) filled: number;
  @ApiProperty({ enum: EMPLOYMENT_TYPES }) employmentType: (typeof EMPLOYMENT_TYPES)[number];
  @ApiProperty({ type: MoneyResponse }) budgetMin: MoneyResponse;
  @ApiProperty({ type: MoneyResponse }) budgetMax: MoneyResponse;
  @ApiProperty({ type: PersonRefResponse }) hiringManager: PersonRefResponse;
  @ApiProperty({ type: PersonRefResponse }) recruiter: PersonRefResponse;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String], example: ['Cisco', 'SD-WAN'] }) skills: string[];
  @ApiProperty({ example: 2 }) expMin: number;
  @ApiProperty({ example: 6 }) expMax: number;
  @ApiProperty({ example: 'CCNA or higher' }) qualifications: string;
  @ApiProperty({ type: [PersonRefResponse] }) panel: PersonRefResponse[];
  @ApiProperty() referralEligible: boolean;
  @ApiProperty({ example: '2026-12-15' }) closingDate: string;
  @ApiProperty({ enum: JOB_STATUSES }) status: (typeof JOB_STATUSES)[number];
  @ApiProperty({ type: PersonRefResponse }) createdBy: PersonRefResponse;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: JobViewerResponse }) viewer: JobViewerResponse;

  static from(this: void, j: JobRecord, viewer: { canEdit: boolean }): JobResponse {
    const r = j.requisition;
    return {
      id: j.id,
      code: j.code,
      requisition: { id: r.id, code: r.code },
      title: r.title,
      company: r.company,
      department: r.department,
      designation: j.designation ? { id: j.designation.id, name: j.designation.title } : null,
      location: r.location,
      positions: r.positions,
      filled: j.filled,
      employmentType: r.employmentType,
      budgetMin: { amount: r.budgetMin.toFixed(2), currency: r.currency },
      budgetMax: { amount: r.budgetMax.toFixed(2), currency: r.currency },
      hiringManager: person(r.hiringManager),
      recruiter: person(j.recruiter),
      description: j.description,
      skills: j.skills,
      expMin: j.expMin,
      expMax: j.expMax,
      qualifications: j.qualifications,
      panel: j.panel.map((p) => person(p.employee)),
      referralEligible: j.referralEligible,
      closingDate: dayOf(j.closingDate),
      status: j.status,
      createdBy: person(j.createdBy),
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      viewer: {
        actions: viewer.canEdit
          ? allowedJobActions({ status: j.status, filled: j.filled, positions: r.positions })
          : [],
        canChangeRecruiter: viewer.canEdit,
      },
    };
  }
}

/** One job with its History tab. */
export class JobDetailResponse extends JobResponse {
  @ApiProperty({ type: [JobEventResponse], description: 'Oldest first' }) history: JobEventResponse[];

  static fromDetail(this: void, j: JobDetailRecord, viewer: { canEdit: boolean }): JobDetailResponse {
    return {
      ...JobResponse.from(j, viewer),
      history: j.events.map((e) => ({ id: e.id, at: e.at.toISOString(), by: e.actorLabel, text: e.text })),
    };
  }
}

export class JobListResponse {
  @ApiProperty({ type: [JobResponse] }) items: JobResponse[];
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}
