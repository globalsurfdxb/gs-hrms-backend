import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { InterviewMode, InterviewRound, InterviewStatus, Prisma } from '../../../generated/prisma/client.js';
import { conflict } from '../../../shared/errors/app-error.js';
import type { PipelineChange } from '../domain/application.rules.js';
import type { HiringScope } from '../domain/job-scope.js';
import { ApplicationsRepository } from './applications.repository.js';
import { applicationInScope } from './job-scope.where.js';
import { PERSON } from './requisitions.repository.js';

const INTERVIEW = {
  id: true,
  round: true,
  startsAt: true,
  endsAt: true,
  durationMin: true,
  timezone: true,
  mode: true,
  link: true,
  notes: true,
  status: true,
  rescheduleCount: true,
  createdAt: true,
  updatedAt: true,
  scheduledBy: PERSON,
  panel: { select: { employee: PERSON }, orderBy: { employee: { fullName: 'asc' } } },
  application: {
    select: {
      id: true,
      stage: true,
      exit: true,
      candidate: { select: { id: true, name: true } },
      job: {
        select: {
          id: true,
          code: true,
          status: true,
          requisition: { select: { title: true, location: { select: { id: true, name: true } } } },
        },
      },
    },
  },
} as const satisfies Prisma.InterviewSelect;

export type InterviewRecord = Prisma.InterviewGetPayload<{ select: typeof INTERVIEW }>;

/** What scheduling needs from the application. */
const FOR_SCHEDULING = {
  id: true,
  stage: true,
  exit: true,
  updatedAt: true,
  job: { select: { status: true, requisition: { select: { location: { select: { id: true, timezone: true } } } } } },
} as const satisfies Prisma.ApplicationSelect;

export type SchedulingApplication = Prisma.ApplicationGetPayload<{ select: typeof FOR_SCHEDULING }>;

export interface InterviewData {
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  mode: InterviewMode;
  link: string;
}

export interface InterviewFilter {
  when: 'upcoming' | 'past' | 'all';
  locationId?: string;
  jobId?: string;
  applicationId?: string;
}

const AUDIT = { module: 'Hiring', entityType: 'interview' } as const;

/* The only place the hiring module touches Prisma for interviews. Reads go through the BR-HIR-022 scope of the
   application behind the interview; writes run in a transaction with their audit row (and, when scheduling moves the
   candidate forward, the stage change), guarded against concurrent edits (409). */
@Injectable()
export class InterviewsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly applications: ApplicationsRepository,
  ) {}

  async list(scope: HiringScope, f: InterviewFilter, page: number, pageSize: number, now = new Date()) {
    const upcoming: Prisma.InterviewWhereInput = { status: 'SCHEDULED', endsAt: { gte: now } };
    const where: Prisma.InterviewWhereInput = {
      AND: [
        { application: applicationInScope(scope) },
        f.when === 'upcoming' ? upcoming : f.when === 'past' ? { NOT: upcoming } : {},
        f.applicationId ? { applicationId: f.applicationId } : {},
        f.jobId ? { application: { jobId: f.jobId } } : {},
        f.locationId ? { application: { job: { requisition: { locationId: f.locationId } } } } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.interview.findMany({
        where,
        select: INTERVIEW,
        orderBy: [{ startsAt: f.when === 'past' ? 'desc' : 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.interview.count({ where }),
    ]);
    return { items, total };
  }

  findVisible(id: string, scope: HiringScope) {
    return this.prisma.interview.findFirst({
      where: { AND: [{ id }, { application: applicationInScope(scope) }] },
      select: INTERVIEW,
    });
  }

  /** The application to schedule for, if the caller may see it (BR-HIR-022). */
  application(id: string, scope: HiringScope) {
    return this.prisma.application.findFirst({
      where: { AND: [{ id }, applicationInScope(scope)] },
      select: FOR_SCHEDULING,
    });
  }

  /** How many of these employees are active (panel members must be). */
  countActive(ids: readonly string[]) {
    return this.prisma.employee.count({ where: { id: { in: [...ids] }, employmentStatus: 'ACTIVE' } });
  }

  /** BR-HIR-010: panelists among `ids` with a SCHEDULED interview overlapping [start, end). Names only — never which
      candidate or job the other interview is for. */
  async clashes(ids: readonly string[], start: Date, end: Date, excludeId?: string) {
    const rows = await this.prisma.interviewPanelMember.findMany({
      where: {
        employeeId: { in: [...ids] },
        interview: {
          status: 'SCHEDULED',
          startsAt: { lt: end },
          endsAt: { gt: start },
          ...(excludeId && { id: { not: excludeId } }),
        },
      },
      select: { employee: PERSON },
      distinct: ['employeeId'],
      orderBy: { employeeId: 'asc' },
    });
    return rows.map((r) => r.employee);
  }

  /* ---------------------------------------------------------------- self-service */

  /** Interviews the employee is on the panel for (My interviews). */
  forPanelist(employeeId: string) {
    return this.prisma.interview.findMany({
      where: { panel: { some: { employeeId } } },
      select: INTERVIEW,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }

  /** The employee's referrals: candidate name and, per application, job title, applied date and where it stands. */
  referralsOf(employeeId: string) {
    return this.prisma.candidate.findMany({
      where: { referrerId: employeeId },
      select: {
        name: true,
        applications: {
          select: {
            id: true,
            stage: true,
            exit: true,
            appliedAt: true,
            job: { select: { requisition: { select: { title: true } } } },
          },
          orderBy: { appliedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /** Open jobs that take referrals, for "Roles you can refer for". */
  referralJobs() {
    return this.prisma.job.findMany({
      where: { status: 'OPEN', referralEligible: true },
      select: {
        id: true,
        code: true,
        closingDate: true,
        requisition: {
          select: {
            title: true,
            department: { select: { name: true } },
            location: { select: { id: true, name: true, timezone: true } },
          },
        },
      },
      orderBy: { closingDate: 'asc' },
      take: 200,
    });
  }

  /* ---------------------------------------------------------------- writes */

  /** BR-HIR-010: a new interview with its panel; `move` advances the candidate in the same transaction. */
  schedule(
    application: SchedulingApplication,
    data: InterviewData & { round: InterviewRound; timezone: string; notes: string },
    panelIds: readonly string[],
    move: PipelineChange | null,
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { id } = await tx.interview.create({
        data: {
          ...data,
          applicationId: application.id,
          scheduledById: actor.id!,
          panel: { createMany: { data: panelIds.map((employeeId) => ({ employeeId })) } },
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'interview.scheduled',
          entityId: id,
          after: { applicationId: application.id, round: data.round, ...auditable(data, panelIds) },
        },
        tx,
      );
      if (move) await this.applications.applyChange(tx, application, move, 'application.moved', actor);
      return tx.interview.findUniqueOrThrow({ where: { id }, select: INTERVIEW });
    });
  }

  reschedule(before: InterviewRecord, data: InterviewData, panelIds: readonly string[], actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.guardedUpdate(tx, before, { ...data, rescheduleCount: { increment: 1 } });
      await tx.interviewPanelMember.deleteMany({ where: { interviewId: before.id } });
      await tx.interviewPanelMember.createMany({
        data: panelIds.map((employeeId) => ({ interviewId: before.id, employeeId })),
      });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'interview.rescheduled',
          entityId: before.id,
          before: auditable(
            before,
            before.panel.map((p) => p.employee.id),
          ),
          after: auditable(data, panelIds),
        },
        tx,
      );
      return tx.interview.findUniqueOrThrow({ where: { id: before.id }, select: INTERVIEW });
    });
  }

  setStatus(before: InterviewRecord, status: InterviewStatus, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.guardedUpdate(tx, before, { status });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: status === 'COMPLETED' ? 'interview.completed' : 'interview.cancelled',
          entityId: before.id,
          before: { status: before.status },
          after: { status },
        },
        tx,
      );
      return tx.interview.findUniqueOrThrow({ where: { id: before.id }, select: INTERVIEW });
    });
  }

  private async guardedUpdate(
    tx: Prisma.TransactionClient,
    before: InterviewRecord,
    data: Prisma.InterviewUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.interview.updateMany({ where: { id: before.id, updatedAt: before.updatedAt }, data });
    if (count === 0) {
      throw conflict('interview.changed', 'This interview was changed by someone else. Reload it and try again.');
    }
  }
}

/** Audit copy: times, mode, panel ids and whether there is a link. Notes and the link itself stay out (they may hold
    personal details or meeting passcodes). */
function auditable(d: InterviewData, panelIds: readonly string[]): Prisma.InputJsonObject {
  return {
    startsAt: d.startsAt.toISOString(),
    durationMin: d.durationMin,
    mode: d.mode,
    hasLink: d.link !== '',
    panelIds: [...panelIds],
  };
}
