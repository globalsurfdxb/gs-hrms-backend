import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, notFound } from '../../../shared/errors/app-error.js';
import { dayOf, todayIn } from '../../../shared/time/calendar-day.js';
import { instantIn } from '../../../shared/time/wall-clock.js';
import type {
  InterviewClashesQuery,
  ListInterviewsQuery,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
} from '../api/dto/interview.dto.js';
import {
  InterviewClashesResponse,
  InterviewListResponse,
  InterviewResponse,
  MyInterviewResponse,
  type MyInterviewsResponse,
  type MyReferralsResponse,
  referralStatus,
} from '../api/dto/interview.response.js';
import { person } from '../api/dto/common.response.js';
import { moveStage } from '../domain/application.rules.js';
import {
  assertCanInterview,
  assertScheduled,
  checkInterviewInput,
  endOf,
  stageAfterScheduling,
  type InterviewRound,
} from '../domain/interview.rules.js';
import {
  InterviewsRepository,
  type InterviewData,
  type InterviewRecord,
  type SchedulingApplication,
} from '../infrastructure/interviews.repository.js';
import { hiringScopeOf } from './hiring-access.js';

/** How a round reads in the stage history. */
const ROUND_LABEL: Record<InterviewRound, string> = {
  SCREENING_CALL: 'Screening call',
  TECHNICAL: 'Technical interview',
  HR: 'HR interview',
  FINAL: 'Final round',
};

/* Use cases for interviews (spec docs/modules/hiring.md, step 4, BR-HIR-010). No HTTP and no Prisma here.
   Full hiring access sees every interview; anyone else only those on their own jobs (BR-HIR-022) — another is a 404.
   Panelists see their own interviews through /me/interviews, whatever their permissions. */
@Injectable()
export class InterviewsService {
  constructor(private readonly interviews: InterviewsRepository) {}

  async list(query: ListInterviewsQuery, user: AuthUser): Promise<InterviewListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.interviews.list(
      hiringScopeOf(user),
      {
        when: query.when ?? 'upcoming',
        locationId: query.locationId,
        jobId: query.jobId,
        applicationId: query.applicationId,
      },
      page,
      pageSize,
    );
    const viewer = viewerOf(user);
    return { items: items.map((i) => InterviewResponse.from(i, viewer)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<InterviewResponse> {
    return InterviewResponse.from(await this.found(id, user), viewerOf(user));
  }

  /** BR-HIR-010: schedule a round; moves the candidate forward to it. */
  async schedule(dto: ScheduleInterviewDto, user: AuthUser): Promise<InterviewResponse> {
    const app = await this.applicationFor(dto.applicationId, user);
    assertCanInterview({ stage: app.stage, exit: app.exit, jobStatus: app.job.status });
    const timezone = app.job.requisition.location.timezone;
    const panelIds = unique(dto.panelIds);
    const data = await this.checked(
      { date: dto.date, time: dto.time, durationMin: dto.durationMin, mode: dto.mode, link: dto.link ?? '' },
      timezone,
      panelIds,
    );
    const to = stageAfterScheduling(app.stage, dto.round);
    const move = to
      ? moveStage(
          { stage: app.stage, exit: app.exit, exitFrom: null, jobStatus: app.job.status, offerSent: false },
          to,
          `Interview scheduled: ${ROUND_LABEL[dto.round]}`,
        )
      : null;
    const saved = await this.interviews.schedule(
      app,
      { ...data, round: dto.round, timezone, notes: dto.notes?.trim() ?? '' },
      panelIds,
      move,
      actorOf(user),
    );
    return InterviewResponse.from(saved, viewerOf(user));
  }

  /** New time and, optionally, duration, mode, panel and link. Only a SCHEDULED interview of an active candidate. */
  async reschedule(id: string, dto: RescheduleInterviewDto, user: AuthUser): Promise<InterviewResponse> {
    const before = await this.found(id, user);
    assertScheduled(before.status);
    assertCanInterview({
      stage: before.application.stage,
      exit: before.application.exit,
      jobStatus: before.application.job.status,
    });
    const panelIds = dto.panelIds ? unique(dto.panelIds) : before.panel.map((p) => p.employee.id);
    const data = await this.checked(
      {
        date: dto.date,
        time: dto.time,
        durationMin: dto.durationMin ?? before.durationMin,
        mode: dto.mode ?? before.mode,
        link: dto.link ?? before.link,
      },
      before.timezone,
      panelIds,
    );
    if (unchanged(before, data, panelIds)) return InterviewResponse.from(before, viewerOf(user));
    return InterviewResponse.from(
      await this.interviews.reschedule(before, data, panelIds, actorOf(user)),
      viewerOf(user),
    );
  }

  async complete(id: string, user: AuthUser): Promise<InterviewResponse> {
    return this.setStatus(id, 'COMPLETED', user);
  }

  async cancel(id: string, user: AuthUser): Promise<InterviewResponse> {
    return this.setStatus(id, 'CANCELLED', user);
  }

  /** BR-HIR-010: the form's warning — panelists already booked at an overlapping time. */
  async clashes(query: InterviewClashesQuery, user: AuthUser): Promise<InterviewClashesResponse> {
    const app = await this.applicationFor(query.applicationId, user);
    const start = toInstant(query.date, query.time, app.job.requisition.location.timezone);
    const people = await this.interviews.clashes(
      unique(query.panelIds),
      start,
      endOf(start, query.durationMin),
      query.excludeId,
    );
    return { clashes: people.map(person) };
  }

  /* ---------------------------------------------------------------- self-service */

  /** Interviews the caller is on the panel for (any employee). */
  async mine(user: AuthUser, now = new Date()): Promise<MyInterviewsResponse> {
    const all = await this.interviews.forPanelist(user.employeeId);
    const upcoming = (i: InterviewRecord) => i.status === 'SCHEDULED' && i.endsAt.getTime() >= now.getTime();
    return {
      upcoming: all.filter(upcoming).map((i) => MyInterviewResponse.from(i, user.employeeId)),
      past: all
        .filter((i) => !upcoming(i))
        .reverse()
        .map((i) => MyInterviewResponse.from(i, user.employeeId)),
    };
  }

  /** The caller's referrals (status only) and the open roles that take referrals (any employee). */
  async referrals(user: AuthUser, now = new Date()): Promise<MyReferralsResponse> {
    const [candidates, jobs] = await Promise.all([
      this.interviews.referralsOf(user.employeeId),
      this.interviews.referralJobs(),
    ]);
    const referrals = candidates.flatMap((c) =>
      c.applications.map((a) => ({
        id: a.id,
        candidateName: c.name,
        jobTitle: a.job.requisition.title,
        referredOn: a.appliedAt.toISOString().slice(0, 10),
        status: referralStatus(a),
      })),
    );
    return {
      openRoles: jobs
        .filter((j) => dayOf(j.closingDate) >= todayIn(j.requisition.location.timezone, now))
        .map((j) => ({
          jobId: j.id,
          code: j.code,
          title: j.requisition.title,
          department: j.requisition.department.name,
          location: { id: j.requisition.location.id, name: j.requisition.location.name },
          closingDate: dayOf(j.closingDate),
        })),
      referrals,
      hired: candidates.filter((c) => c.applications.some((a) => a.stage === 'HIRED')).length,
    };
  }

  /* ---------------------------------------------------------------- helpers */

  private async setStatus(id: string, status: 'COMPLETED' | 'CANCELLED', user: AuthUser) {
    const before = await this.found(id, user);
    assertScheduled(before.status);
    return InterviewResponse.from(await this.interviews.setStatus(before, status, actorOf(user)), viewerOf(user));
  }

  private async found(id: string, user: AuthUser): Promise<InterviewRecord> {
    const i = await this.interviews.findVisible(id, hiringScopeOf(user));
    if (!i) throw notFound('interview');
    return i;
  }

  private async applicationFor(id: string, user: AuthUser): Promise<SchedulingApplication> {
    const app = await this.interviews.application(id, hiringScopeOf(user));
    if (!app) throw notFound('application');
    return app;
  }

  /** BR-HIR-010 input: the time in the location's timezone, not in the past; an active panel; an https link. */
  private async checked(
    i: { date: string; time: string; durationMin: number; mode: InterviewData['mode']; link: string },
    timezone: string,
    panelIds: string[],
  ): Promise<InterviewData> {
    const startsAt = toInstant(i.date, i.time, timezone);
    const link = i.link.trim();
    checkInterviewInput({ startsAt, now: new Date(), panelIds, link });
    if ((await this.interviews.countActive(panelIds)) !== panelIds.length) {
      throw new AppError('interview.invalid_panel', 'Every panel member must be an active employee');
    }
    return { startsAt, endsAt: endOf(startsAt, i.durationMin), durationMin: i.durationMin, mode: i.mode, link };
  }
}

const viewerOf = (user: AuthUser) => ({
  canEdit: hasPermission(user.permissions, PERMISSIONS.hiring.interviews, 'edit'),
});

const unique = (ids: readonly string[]) => [...new Set(ids.map((id) => id.toLowerCase()))];

function toInstant(date: string, time: string, timezone: string): Date {
  try {
    return instantIn(date, time, timezone);
  } catch {
    throw new AppError('interview.invalid_time', 'That date and time does not exist');
  }
}

function unchanged(before: InterviewRecord, d: InterviewData, panelIds: readonly string[]): boolean {
  const had = before.panel.map((p) => p.employee.id).sort();
  return (
    before.startsAt.getTime() === d.startsAt.getTime() &&
    before.durationMin === d.durationMin &&
    before.mode === d.mode &&
    before.link === d.link &&
    had.length === panelIds.length &&
    [...panelIds].sort().every((id, n) => id === had[n])
  );
}
