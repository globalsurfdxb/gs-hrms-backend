import { ApiProperty } from '@nestjs/swagger';
import { EXITS, STAGES, type Exit, type Stage } from '../../domain/application.rules.js';
import { CANDIDATE_SOURCES, type CandidateSource } from '../../domain/candidate.rules.js';
import type {
  ApplicationDetailRecord,
  ApplicationRecord,
  APPLICATION_SUMMARY,
} from '../../infrastructure/applications.repository.js';
import type { Prisma } from '../../../../generated/prisma/client.js';

/* Explicit response shapes for applications. Never return Prisma records directly. No salary here. */

type SummaryRecord = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_SUMMARY }>;

export class ApplicationJobRefResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'JOB-0001' }) code: string;
  @ApiProperty({ example: 'Network Engineer' }) title: string;
}

export class StageChangeResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: '2026-10-26T08:00:00.000Z' }) at: string;
  @ApiProperty({ example: 'Dev HR', description: 'Name at the time, or "system"' }) by: string;
  @ApiProperty({ example: 'SCREENING', nullable: true, description: 'Stage or exit code; null on the first line' })
  from: string | null;
  @ApiProperty({ example: 'TECHNICAL_INTERVIEW', description: 'Stage or exit code' }) to: string;
  @ApiProperty({ example: 'Strong screening call', nullable: true }) note: string | null;
}

export class ApplicationSummaryResponse {
  @ApiProperty() id: string;
  @ApiProperty({ type: ApplicationJobRefResponse }) job: ApplicationJobRefResponse;
  @ApiProperty({ enum: STAGES }) stage: Stage;
  @ApiProperty({ enum: EXITS, nullable: true, description: 'Set when the candidate left the pipeline' })
  exit: Exit | null;
  @ApiProperty({ enum: STAGES, nullable: true, description: 'The stage they left from (Reopen returns there)' })
  exitFrom: Stage | null;
  @ApiProperty({ example: 'Skills mismatch', nullable: true }) exitReason: string | null;
  @ApiProperty({ nullable: true }) exitNote: string | null;
  @ApiProperty({ example: '2026-10-20T09:30:00.000Z' }) appliedAt: string;
  @ApiProperty({ example: '2026-10-24T11:00:00.000Z', description: 'Last stage change (for "days in stage")' })
  stageChangedAt: string;

  static from(this: void, a: SummaryRecord): ApplicationSummaryResponse {
    return {
      id: a.id,
      job: { id: a.job.id, code: a.job.code, title: a.job.requisition.title },
      stage: a.stage,
      exit: a.exit,
      exitFrom: a.exitFrom,
      exitReason: a.exitReason,
      exitNote: a.exitNote,
      appliedAt: a.appliedAt.toISOString(),
      stageChangedAt: a.updatedAt.toISOString(),
    };
  }
}

export class ApplicationCandidateResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Priya Nair' }) name: string;
  @ApiProperty({ example: 'priya.nair@example.com' }) email: string;
  @ApiProperty({ example: '+971 50 123 4567' }) phone: string;
  @ApiProperty({ example: 'Network Engineer' }) currentTitle: string;
  @ApiProperty({ example: 'Emirates Networks LLC' }) currentCompany: string;
  @ApiProperty({ example: 4.5 }) experienceYears: number;
  @ApiProperty({ enum: CANDIDATE_SOURCES }) source: CandidateSource;
  @ApiProperty({ type: [String], example: ['Shortlisted'] }) tags: string[];
}

export class ApplicationViewerResponse {
  @ApiProperty({ description: 'Move, exit and reopen (Candidates → Edit)' }) canEdit: boolean;
}

/** A pipeline row: the application with the candidate behind it. */
export class ApplicationResponse extends ApplicationSummaryResponse {
  @ApiProperty({ type: ApplicationCandidateResponse }) candidate: ApplicationCandidateResponse;
  @ApiProperty({ type: ApplicationViewerResponse }) viewer: ApplicationViewerResponse;

  static fromRow(this: void, a: ApplicationRecord, viewer: { canEdit: boolean }): ApplicationResponse {
    const c = a.candidate;
    return {
      ...ApplicationSummaryResponse.from(a),
      candidate: {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        currentTitle: c.currentTitle,
        currentCompany: c.currentCompany,
        experienceYears: c.experienceYears.toNumber(),
        source: c.source,
        tags: c.tags,
      },
      viewer: { canEdit: viewer.canEdit },
    };
  }
}

export class ApplicationDetailResponse extends ApplicationResponse {
  @ApiProperty({ type: [StageChangeResponse], description: 'Oldest first' }) history: StageChangeResponse[];

  static fromDetail(this: void, a: ApplicationDetailRecord, viewer: { canEdit: boolean }): ApplicationDetailResponse {
    return { ...ApplicationResponse.fromRow(a, viewer), history: a.history.map(stageChange) };
  }
}

export class ApplicationListResponse {
  @ApiProperty({ type: [ApplicationResponse] }) items: ApplicationResponse[];
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}

export const stageChange = (h: ApplicationDetailRecord['history'][number]): StageChangeResponse => ({
  id: h.id,
  at: h.at.toISOString(),
  by: h.actorLabel,
  from: h.from,
  to: h.to,
  note: h.note,
});
