import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { ApplicationExit, ApplicationStage, CandidateSource, Prisma } from '../../../generated/prisma/client.js';
import { conflict } from '../../../shared/errors/app-error.js';
import { appliedHistory, type PipelineChange } from '../domain/application.rules.js';
import { candidateSearch } from './candidate-search.js';

/** An application as candidate pages list it. `updatedAt` = when it last changed stage (only pipeline moves update
    an application). */
export const APPLICATION_SUMMARY = {
  id: true,
  stage: true,
  exit: true,
  exitFrom: true,
  exitReason: true,
  exitNote: true,
  appliedAt: true,
  updatedAt: true,
  job: {
    select: {
      id: true,
      code: true,
      status: true,
      requisition: { select: { title: true, hiringManagerId: true } },
    },
  },
} as const satisfies Prisma.ApplicationSelect;

export const STAGE_HISTORY = {
  select: { id: true, at: true, actorLabel: true, from: true, to: true, note: true },
  orderBy: { at: 'asc' },
} as const satisfies Prisma.Application$historyArgs;

const APPLICATION = {
  ...APPLICATION_SUMMARY,
  candidate: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      currentTitle: true,
      currentCompany: true,
      experienceYears: true,
      source: true,
      tags: true,
    },
  },
} as const satisfies Prisma.ApplicationSelect;

const APPLICATION_DETAIL = { ...APPLICATION, history: STAGE_HISTORY } as const satisfies Prisma.ApplicationSelect;

export type ApplicationRecord = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION }>;
export type ApplicationDetailRecord = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_DETAIL }>;

export interface PipelineFilter {
  stage?: ApplicationStage;
  exit?: ApplicationExit | 'NONE';
  q?: string;
  source?: CandidateSource;
  tag?: string;
  appliedWithinDays?: number;
  inStageForDays?: number;
  sort: 'applied' | 'name' | 'stage' | 'inStage';
  dir: 'asc' | 'desc';
}

const AUDIT = { module: 'Hiring', entityType: 'application' } as const;
const DAY = 86_400_000;

/* The only place the hiring module touches Prisma for applications. Every pipeline change appends a stage-history
   line and an audit row in one transaction, guarded against concurrent moves (409). */
@Injectable()
export class ApplicationsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A job's pipeline (board and list). */
  async forJob(jobId: string, f: PipelineFilter, page: number, pageSize: number, now = new Date()) {
    const where: Prisma.ApplicationWhereInput = {
      jobId,
      ...(f.stage && { stage: f.stage, exit: null }),
      ...(f.exit && { exit: f.exit === 'NONE' ? null : f.exit }),
      ...(f.appliedWithinDays && { appliedAt: { gte: new Date(now.getTime() - f.appliedWithinDays * DAY) } }),
      ...(f.inStageForDays && { updatedAt: { lte: new Date(now.getTime() - f.inStageForDays * DAY) } }),
      candidate: {
        AND: [
          f.q ? candidateSearch(f.q) : {},
          f.source ? { source: f.source } : {},
          f.tag ? { tags: { has: f.tag } } : {},
        ],
      },
    };
    const orderBy: Prisma.ApplicationOrderByWithRelationInput =
      f.sort === 'name'
        ? { candidate: { name: f.dir } }
        : f.sort === 'stage'
          ? { stage: f.dir }
          : f.sort === 'inStage'
            ? // Longest in stage first = oldest last move first.
              { updatedAt: f.dir === 'desc' ? 'asc' : 'desc' }
            : { appliedAt: f.dir };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        select: APPLICATION,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.application.findUnique({ where: { id }, select: APPLICATION_DETAIL });
  }

  /** The job an application would go to, with what the rules and the location need. */
  job(id: string) {
    return this.prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        requisition: { select: { locationId: true, hiringManagerId: true, location: { select: { currency: true } } } },
      },
    });
  }

  exists(candidateId: string, jobId: string) {
    return this.prisma.application.count({ where: { candidateId, jobId } }).then((n) => n > 0);
  }

  /** Whether the application's offer is out with the candidate. Offers arrive in step 5; until then, never. */
  offerSent(_applicationId: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  /* ---------------------------------------------------------------- writes */

  /** BR-HIR-008: a new application at APPLIED with its first history line. */
  create(candidateId: string, jobId: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { id } = await tx.application
        .create({
          data: {
            candidateId,
            jobId,
            createdById: actor.id!,
            history: { create: { ...appliedHistory, actorId: actor.id, actorLabel: actor.label } },
          },
          select: { id: true },
        })
        .catch((e: unknown) => {
          if ((e as { code?: string }).code === 'P2002') {
            throw conflict('application.already_applied', 'This candidate has already applied to this job');
          }
          throw e;
        });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'application.created',
          entityId: id,
          after: { candidateId, jobId, stage: 'APPLIED' },
        },
        tx,
      );
      return tx.application.findUniqueOrThrow({ where: { id }, select: APPLICATION_DETAIL });
    });
  }

  /** Applies a pipeline change (BR-HIR-009) with its history line and audit row. */
  change(before: ApplicationDetailRecord, c: PipelineChange, action: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id: before.id, updatedAt: before.updatedAt },
        data: { stage: c.stage, exit: c.exit, exitFrom: c.exitFrom, exitReason: c.exitReason, exitNote: c.exitNote },
      });
      if (count === 0) {
        throw conflict('application.changed', 'This application was changed by someone else. Reload it and try again.');
      }
      await tx.stageChange.create({
        data: { applicationId: before.id, actorId: actor.id, actorLabel: actor.label, ...c.history },
      });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action,
          entityId: before.id,
          before: { stage: before.stage, exit: before.exit },
          after: { stage: c.stage, exit: c.exit, reason: c.exitReason },
        },
        tx,
      );
      return tx.application.findUniqueOrThrow({ where: { id: before.id }, select: APPLICATION_DETAIL });
    });
  }
}
