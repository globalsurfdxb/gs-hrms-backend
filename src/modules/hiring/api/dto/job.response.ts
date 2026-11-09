import { ApiProperty } from '@nestjs/swagger';
import { dayOf } from '../../../../shared/time/calendar-day.js';
import { allowedJobActions, type JobAction } from '../../domain/job.rules.js';
import type { JobDetailRecord, JobRecord } from '../../infrastructure/jobs.repository.js';
import { MoneyResponse, PersonRefResponse, person, RefResponse } from './common.response.js';
import { EMPLOYMENT_TYPES } from './create-requisition.dto.js';
import { JOB_STATUSES } from './list-jobs.query.js';

/* Explicit response shapes. Never return Prisma records directly. Budget is shown: only Jobs → View holders reach
   these routes, and without full hiring access only for their own jobs (BR-HIR-022). */

/** What the caller may do: status actions (full access) and the recruiter choice for a given job (BR-HIR-021). */
export interface JobViewer {
  canEdit: boolean;
  canChooseRecruiter: (j: { taManager: { id: string } | null }) => boolean;
}

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
  @ApiProperty({
    description:
      'Choose or change the recruiter (Jobs → Edit and BR-HIR-021: Super Admin, a Talent Acquisition Manager, or full ' +
      'hiring access on a job with no TA Manager)',
  })
  canChangeRecruiter: boolean;
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
  @ApiProperty({
    type: PersonRefResponse,
    nullable: true,
    description: 'Null while the Talent Acquisition Manager has yet to choose (BR-HIR-021)',
  })
  recruiter: PersonRefResponse | null;
  @ApiProperty({
    type: PersonRefResponse,
    nullable: true,
    description: 'The Talent Acquisition Manager the job was handed to; null if there was none when it was made',
  })
  taManager: PersonRefResponse | null;
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

  static from(this: void, j: JobRecord, viewer: JobViewer): JobResponse {
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
      recruiter: j.recruiter ? person(j.recruiter) : null,
      taManager: j.taManager ? person(j.taManager) : null,
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
        canChangeRecruiter: viewer.canChooseRecruiter(j),
      },
    };
  }
}

/** One job with its History tab. */
export class JobDetailResponse extends JobResponse {
  @ApiProperty({ type: [JobEventResponse], description: 'Oldest first' }) history: JobEventResponse[];

  static fromDetail(this: void, j: JobDetailRecord, viewer: JobViewer): JobDetailResponse {
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

export class RecruiterOptionResponse extends PersonRefResponse {
  @ApiProperty({ example: 'Recruiter', nullable: true }) designation: string | null;
}

/** BR-HIR-021: who a new job goes to and who may run it. */
export class RecruiterPoolResponse {
  @ApiProperty({
    type: PersonRefResponse,
    nullable: true,
    description: 'The Talent Acquisition Manager (active employee with that designation); null if there is none',
  })
  taManager: PersonRefResponse | null;
  @ApiProperty({
    description: 'A job you create now is handed to the TA Manager — leave the recruiter out of the job form',
  })
  handsOver: boolean;
  @ApiProperty({
    type: [RecruiterOptionResponse],
    description:
      'The Talent Acquisition team (Recruiters and the TA Manager). Empty when there is no TA Manager: ' +
      'then any active employee may be chosen.',
  })
  pool: RecruiterOptionResponse[];

  static from(
    this: void,
    taManager: { id: string; employeeCode: string; fullName: string } | null,
    pool: { id: string; employeeCode: string; fullName: string; designation: { title: string } | null }[],
    handsOver: boolean,
  ): RecruiterPoolResponse {
    return {
      taManager: taManager ? person(taManager) : null,
      handsOver,
      pool: pool.map((e) => ({ ...person(e), designation: e.designation?.title ?? null })),
    };
  }
}
