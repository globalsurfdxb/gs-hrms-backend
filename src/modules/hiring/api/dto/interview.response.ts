import { ApiProperty } from '@nestjs/swagger';
import { wallClockIn } from '../../../../shared/time/wall-clock.js';
import { INTERVIEW_DURATIONS, INTERVIEW_MODES, INTERVIEW_ROUNDS } from '../../domain/interview.rules.js';
import type { InterviewRecord } from '../../infrastructure/interviews.repository.js';
import { PersonRefResponse, person, RefResponse } from './common.response.js';

/* Explicit response shapes for interviews. Enums are returned as stored (UPPER_SNAKE). Times come both as the
   location's local date and time (what people read and type) and as instants (startsAt/endsAt, ISO). */

const STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;

export class InterviewJobResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'JOB-0001' }) code: string;
  @ApiProperty({ example: 'Network Engineer' }) title: string;
}

export class InterviewApplicationResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'TECHNICAL_INTERVIEW' }) stage: string;
  @ApiProperty({ type: String, nullable: true, example: null }) exit: string | null;
}

export class InterviewTimesResponse {
  @ApiProperty({ example: '2026-12-01', description: 'Local day at the location' }) date: string;
  @ApiProperty({ example: '10:00', description: 'Local time at the location (24-hour)' }) time: string;
  @ApiProperty({ example: 'Asia/Dubai' }) timezone: string;
  @ApiProperty({ example: '2026-12-01T06:00:00.000Z' }) startsAt: string;
  @ApiProperty({ example: '2026-12-01T07:00:00.000Z' }) endsAt: string;
  @ApiProperty({ enum: INTERVIEW_DURATIONS, example: 60 }) durationMin: number;
}

export class InterviewViewerResponse {
  @ApiProperty({ description: 'Reschedule, complete or cancel: Interviews → Edit and still SCHEDULED' })
  canEdit: boolean;
}

export class InterviewResponse extends InterviewTimesResponse {
  @ApiProperty() id: string;
  @ApiProperty({ type: InterviewApplicationResponse }) application: InterviewApplicationResponse;
  @ApiProperty({ type: RefResponse, description: 'The candidate (id and name)' }) candidate: RefResponse;
  @ApiProperty({ type: InterviewJobResponse }) job: InterviewJobResponse;
  @ApiProperty({ type: RefResponse, description: 'id is the location id, e.g. Dubai' }) location: RefResponse;
  @ApiProperty({ enum: INTERVIEW_ROUNDS }) round: (typeof INTERVIEW_ROUNDS)[number];
  @ApiProperty({ enum: INTERVIEW_MODES }) mode: (typeof INTERVIEW_MODES)[number];
  @ApiProperty({ type: [PersonRefResponse] }) panel: PersonRefResponse[];
  @ApiProperty({ example: 'https://teams.microsoft.com/l/meetup-join/…', description: 'Empty when none' })
  link: string;
  @ApiProperty({ example: 'Focus on firewall design.' }) notes: string;
  @ApiProperty({ enum: STATUSES }) status: (typeof STATUSES)[number];
  @ApiProperty({ example: 0, description: 'How many times it was moved' }) rescheduleCount: number;
  @ApiProperty({ type: PersonRefResponse }) scheduledBy: PersonRefResponse;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: InterviewViewerResponse }) viewer: InterviewViewerResponse;

  static from(this: void, i: InterviewRecord, viewer: { canEdit: boolean }): InterviewResponse {
    return {
      id: i.id,
      application: { id: i.application.id, stage: i.application.stage, exit: i.application.exit },
      candidate: { id: i.application.candidate.id, name: i.application.candidate.name },
      job: { id: i.application.job.id, code: i.application.job.code, title: i.application.job.requisition.title },
      location: i.application.job.requisition.location,
      round: i.round,
      ...timesOf(i),
      mode: i.mode,
      panel: i.panel.map((p) => person(p.employee)),
      link: i.link,
      notes: i.notes,
      status: i.status,
      rescheduleCount: i.rescheduleCount,
      scheduledBy: person(i.scheduledBy),
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      viewer: { canEdit: viewer.canEdit && i.status === 'SCHEDULED' },
    };
  }
}

export class InterviewListResponse {
  @ApiProperty({ type: [InterviewResponse] }) items: InterviewResponse[];
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}

export class InterviewClashesResponse {
  @ApiProperty({
    type: [PersonRefResponse],
    description: 'Panelists who already have a scheduled interview overlapping this time (a warning, not a refusal)',
  })
  clashes: PersonRefResponse[];
}

/** My interviews: what a panelist needs — no candidate contact details, salary or stage history. */
export class MyInterviewResponse extends InterviewTimesResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Priya Nair' }) candidateName: string;
  @ApiProperty({ example: 'Network Engineer' }) jobTitle: string;
  @ApiProperty({ type: RefResponse }) location: RefResponse;
  @ApiProperty({ enum: INTERVIEW_ROUNDS }) round: (typeof INTERVIEW_ROUNDS)[number];
  @ApiProperty({ enum: INTERVIEW_MODES }) mode: (typeof INTERVIEW_MODES)[number];
  @ApiProperty({ type: [PersonRefResponse], description: 'The other panel members' }) otherPanel: PersonRefResponse[];
  @ApiProperty({ description: 'Empty when none' }) link: string;
  @ApiProperty() notes: string;
  @ApiProperty({ enum: STATUSES }) status: (typeof STATUSES)[number];

  static from(this: void, i: InterviewRecord, meId: string): MyInterviewResponse {
    return {
      id: i.id,
      candidateName: i.application.candidate.name,
      jobTitle: i.application.job.requisition.title,
      location: i.application.job.requisition.location,
      round: i.round,
      ...timesOf(i),
      mode: i.mode,
      otherPanel: i.panel.filter((p) => p.employee.id !== meId).map((p) => person(p.employee)),
      link: i.link,
      notes: i.notes,
      status: i.status,
    };
  }
}

export class MyInterviewsResponse {
  @ApiProperty({ type: [MyInterviewResponse], description: 'Scheduled and not yet over, soonest first' })
  upcoming: MyInterviewResponse[];
  @ApiProperty({ type: [MyInterviewResponse], description: 'Completed, cancelled or already over, latest first' })
  past: MyInterviewResponse[];
}

function timesOf(i: InterviewRecord): InterviewTimesResponse {
  const local = wallClockIn(i.startsAt, i.timezone);
  return {
    date: local.day,
    time: local.time,
    timezone: i.timezone,
    startsAt: i.startsAt.toISOString(),
    endsAt: i.endsAt.toISOString(),
    durationMin: i.durationMin,
  };
}

/* ---------------------------------------------------------------- My referrals */

export const REFERRAL_STATUSES = ['RECEIVED', 'IN_PROCESS', 'OFFER_STAGE', 'HIRED', 'NOT_SELECTED', 'CLOSED'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Where a referral stands, in plain words (frontend statusOf); the hiring team keeps the details. */
export const referralStatus = (a: { stage: string; exit: string | null }): ReferralStatus =>
  a.exit === 'REJECTED'
    ? 'NOT_SELECTED'
    : a.exit
      ? 'CLOSED'
      : a.stage === 'HIRED'
        ? 'HIRED'
        : a.stage === 'OFFER'
          ? 'OFFER_STAGE'
          : a.stage === 'APPLIED'
            ? 'RECEIVED'
            : 'IN_PROCESS';

export class MyReferralResponse {
  @ApiProperty({ description: 'The application id' }) id: string;
  @ApiProperty({ example: 'Priya Nair' }) candidateName: string;
  @ApiProperty({ example: 'Network Engineer' }) jobTitle: string;
  @ApiProperty({ example: '2026-11-20', description: 'The day the application was added' }) referredOn: string;
  @ApiProperty({ enum: REFERRAL_STATUSES }) status: ReferralStatus;
}

export class ReferralRoleResponse {
  @ApiProperty() jobId: string;
  @ApiProperty({ example: 'JOB-0001' }) code: string;
  @ApiProperty({ example: 'Network Engineer' }) title: string;
  @ApiProperty({ example: 'Cloud & Infra' }) department: string;
  @ApiProperty({ type: RefResponse }) location: RefResponse;
  @ApiProperty({ example: '2026-12-31' }) closingDate: string;
}

export class MyReferralsResponse {
  @ApiProperty({
    type: [ReferralRoleResponse],
    description: 'Open jobs that take referrals and have not passed their closing date',
  })
  openRoles: ReferralRoleResponse[];
  @ApiProperty({ type: [MyReferralResponse], description: 'One row per application of a candidate you referred' })
  referrals: MyReferralResponse[];
  @ApiProperty({ example: 1, description: 'Referred candidates who were hired' }) hired: number;
}
