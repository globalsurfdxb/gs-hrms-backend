import { ApiProperty } from '@nestjs/swagger';
import { dayOf } from '../../../../shared/time/calendar-day.js';
import { canDecideStep, type Actor } from '../../domain/requisition.rules.js';
import type { RequisitionRecord } from '../../infrastructure/requisitions.repository.js';
import { MoneyResponse, PersonRefResponse, person, RefResponse } from './common.response.js';
import { EMPLOYMENT_TYPES, REQUISITION_REASONS } from './create-requisition.dto.js';
import { REQUISITION_STATUSES } from './list-requisitions.query.js';

/* Explicit response shapes. Never return Prisma records directly — every field that leaves the API is listed here.
   Enums are returned as stored (UPPER_SNAKE); the frontend maps them to its labels. */

export class RequisitionStepResponse {
  @ApiProperty({ example: 1 }) position: number;
  @ApiProperty({ enum: ['HIRING_MANAGER', 'HR', 'MANAGEMENT'] }) label: 'HIRING_MANAGER' | 'HR' | 'MANAGEMENT';
  @ApiProperty({
    enum: ['WAITING', 'PENDING', 'APPROVED', 'REJECTED'],
    description: 'PENDING = waiting for a decision now',
  })
  status: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED';
  @ApiProperty({ type: PersonRefResponse, nullable: true }) decidedBy: PersonRefResponse | null;
  @ApiProperty({ type: String, nullable: true, example: '2026-10-22T08:00:00.000Z' }) decidedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
}

/** What the caller may do now — the frontend shows buttons from this instead of repeating the rules. */
export class RequisitionViewerResponse {
  @ApiProperty({ description: 'Edit and (re)submit: DRAFT/REJECTED, and you raised it, manage it, or run recruiting' })
  canEdit: boolean;
  @ApiProperty({ description: 'The pending approval step is yours to decide' }) canDecide: boolean;
  @ApiProperty({ description: 'Hold, resume or close (HR / Super Admin)' }) canManage: boolean;
  @ApiProperty({ description: 'APPROVED, no job yet, and you have Jobs → Add' }) canCreateJob: boolean;
}

/** The job opened from a requisition. */
export class RequisitionJobResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'JOB-0001' }) code: string;
  @ApiProperty({ enum: ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED'] })
  status: 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED';
}

export class RequisitionResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'REQ-0001' }) code: string;
  @ApiProperty({ example: 'Network Engineer' }) title: string;
  @ApiProperty({ type: RefResponse }) company: RefResponse;
  @ApiProperty({ type: RefResponse }) department: RefResponse;
  @ApiProperty({ type: RefResponse, nullable: true, description: 'name = designation title' })
  designation: RefResponse | null;
  @ApiProperty({ type: RefResponse, description: 'id is the location id, e.g. Dubai' }) location: RefResponse;
  @ApiProperty({ example: 2 }) positions: number;
  @ApiProperty({ enum: EMPLOYMENT_TYPES }) employmentType: (typeof EMPLOYMENT_TYPES)[number];
  @ApiProperty({ enum: REQUISITION_REASONS }) reason: (typeof REQUISITION_REASONS)[number];
  @ApiProperty({ type: PersonRefResponse, nullable: true }) replaces: PersonRefResponse | null;
  @ApiProperty({ type: MoneyResponse }) budgetMin: MoneyResponse;
  @ApiProperty({ type: MoneyResponse }) budgetMax: MoneyResponse;
  @ApiProperty({ example: '2026-12-01' }) targetStart: string;
  @ApiProperty({ type: PersonRefResponse }) hiringManager: PersonRefResponse;
  @ApiProperty() justification: string;
  @ApiProperty({ enum: REQUISITION_STATUSES }) status: (typeof REQUISITION_STATUSES)[number];
  @ApiProperty({ type: [RequisitionStepResponse], description: 'Empty until first submitted' })
  steps: RequisitionStepResponse[];
  @ApiProperty({ type: RequisitionJobResponse, nullable: true, description: 'The job opened from it, if any' })
  job: RequisitionJobResponse | null;
  @ApiProperty({ type: PersonRefResponse }) createdBy: PersonRefResponse;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: RequisitionViewerResponse }) viewer: RequisitionViewerResponse;

  static from(
    this: void,
    r: RequisitionRecord,
    viewer: Actor & { seesAll: boolean; canAddJob: boolean },
  ): RequisitionResponse {
    const pending = r.steps.find((s) => s.status === 'PENDING');
    const involved = viewer.seesAll || r.createdBy.id === viewer.employeeId || r.hiringManager.id === viewer.employeeId;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      company: r.company,
      department: r.department,
      designation: r.designation ? { id: r.designation.id, name: r.designation.title } : null,
      location: r.location,
      positions: r.positions,
      employmentType: r.employmentType,
      reason: r.reason,
      replaces: r.replaces ? person(r.replaces) : null,
      budgetMin: { amount: r.budgetMin.toFixed(2), currency: r.currency },
      budgetMax: { amount: r.budgetMax.toFixed(2), currency: r.currency },
      targetStart: dayOf(r.targetStart),
      hiringManager: person(r.hiringManager),
      justification: r.justification,
      status: r.status,
      steps: r.steps.map((s) => ({
        position: s.position,
        label: s.label,
        status: s.status,
        decidedBy: s.decidedBy ? person(s.decidedBy) : null,
        decidedAt: s.decidedAt?.toISOString() ?? null,
        note: s.note,
      })),
      job: r.job,
      createdBy: person(r.createdBy),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      viewer: {
        canEdit: involved && (r.status === 'DRAFT' || r.status === 'REJECTED'),
        canDecide:
          r.status === 'PENDING_APPROVAL' &&
          !!pending &&
          canDecideStep(pending.label, viewer, { hiringManagerId: r.hiringManager.id, raisedById: r.createdBy.id }),
        canManage: viewer.seesAll && (r.status === 'APPROVED' || r.status === 'ON_HOLD'),
        canCreateJob: viewer.canAddJob && r.status === 'APPROVED' && !r.job,
      },
    };
  }
}

export class RequisitionListResponse {
  @ApiProperty({ type: [RequisitionResponse] }) items: RequisitionResponse[];
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}
