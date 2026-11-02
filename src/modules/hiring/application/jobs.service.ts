import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay } from '../../../shared/time/calendar-day.js';
import type { ChangeRecruiterDto } from '../api/dto/change-recruiter.dto.js';
import type { CreateJobDto } from '../api/dto/create-job.dto.js';
import { JobDetailResponse, JobListResponse, JobResponse } from '../api/dto/job.response.js';
import type { ListJobsQuery } from '../api/dto/list-jobs.query.js';
import { assertCanCreateJob, checkJobInput, jobHistory, jobStatusAfter, type JobAction } from '../domain/job.rules.js';
import { JobsRepository } from '../infrastructure/jobs.repository.js';
import { assertFullHiringAccess, hasFullHiringAccess, hiringScopeOf } from './hiring-access.js';

/* Use cases for jobs (spec docs/modules/hiring.md, step 2). Every route needs a Jobs permission. Full hiring access
   sees every job and runs it (create, status, recruiter); anyone else sees their own jobs only (BR-HIR-022) — another
   job is a 404. */
@Injectable()
export class JobsService {
  constructor(private readonly jobs: JobsRepository) {}

  async list(query: ListJobsQuery, user: AuthUser): Promise<JobListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.jobs.list(
      hiringScopeOf(user),
      { status: query.status, locationId: query.locationId, recruiterId: query.recruiterId },
      page,
      pageSize,
    );
    const viewer = viewerOf(user);
    return { items: items.map((j) => JobResponse.from(j, viewer)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<JobDetailResponse> {
    return JobDetailResponse.fromDetail(await this.found(id, user), viewerOf(user));
  }

  /** BR-HIR-005: open a job from an approved requisition. */
  async create(requisitionId: string, dto: CreateJobDto, user: AuthUser): Promise<JobDetailResponse> {
    assertFullHiringAccess(user);
    const req = await this.jobs.requisition(requisitionId);
    if (!req) throw notFound('requisition');
    assertCanCreateJob({ status: req.status, hasJob: !!req.job });

    const designationId = dto.designationId ?? req.designationId;
    if (dto.designationId) {
      const d = await this.jobs.designation(dto.designationId);
      if (d?.departmentId !== req.departmentId) {
        throw new AppError(
          'job.designation_mismatch',
          "The designation does not belong to the requisition's department",
        );
      }
    }
    const input = checkJobInput({
      description: dto.description,
      skills: dto.skills,
      expMin: dto.expMin,
      expMax: dto.expMax,
      panelIds: dto.panelIds,
    });
    const active = await this.jobs.activeEmployees([dto.recruiterId, ...input.panelIds]);
    if (!active.has(dto.recruiterId)) throw invalidRecruiter();
    if (input.panelIds.some((p) => !active.has(p))) {
      throw new AppError('job.invalid_panel', 'Every interviewer must be an active employee');
    }

    const status = dto.publish ? 'OPEN' : 'DRAFT';
    const job = await this.jobs.create(
      {
        requisitionId,
        designationId,
        description: input.description,
        skills: input.skills,
        expMin: input.expMin,
        expMax: input.expMax,
        qualifications: dto.qualifications?.trim() ?? '',
        referralEligible: dto.referralEligible ?? true,
        closingDate: dateOfDay(dto.closingDate),
        recruiterId: dto.recruiterId,
        status,
      },
      input.panelIds,
      jobHistory.created(req.code, status),
      actorOf(user),
    );
    return JobDetailResponse.fromDetail(job, viewerOf(user));
  }

  /** BR-HIR-006: open, hold, resume, close or reopen. */
  async changeStatus(id: string, action: JobAction, user: AuthUser): Promise<JobDetailResponse> {
    const before = await this.found(id, user);
    assertFullHiringAccess(user);
    const { status, verb } = jobStatusAfter(action, {
      status: before.status,
      filled: before.filled,
      positions: before.requisition.positions,
    });
    const job = await this.jobs.change(
      before,
      { status },
      jobHistory.status(before.status, status),
      { action: `job.${verb}`, before: { status: before.status }, after: { status } },
      actorOf(user),
    );
    return JobDetailResponse.fromDetail(job, viewerOf(user));
  }

  /** Full access for now; step 3.1d moves the choice to the Talent Acquisition Manager (BR-HIR-021). */
  async changeRecruiter(id: string, dto: ChangeRecruiterDto, user: AuthUser): Promise<JobDetailResponse> {
    const before = await this.found(id, user);
    assertFullHiringAccess(user);
    if (before.recruiter.id === dto.recruiterId) return JobDetailResponse.fromDetail(before, viewerOf(user));
    const active = await this.jobs.activeEmployees([dto.recruiterId]);
    const name = active.get(dto.recruiterId);
    if (!name) throw invalidRecruiter();
    // The new recruiter is told once core/notifications exists (frontend: pushNotice to the recruiter).
    const job = await this.jobs.change(
      before,
      { recruiterId: dto.recruiterId },
      jobHistory.recruiter(before.recruiter.fullName, name),
      {
        action: 'job.recruiter_changed',
        before: { recruiterId: before.recruiter.id },
        after: { recruiterId: dto.recruiterId },
      },
      actorOf(user),
    );
    return JobDetailResponse.fromDetail(job, viewerOf(user));
  }

  private async found(id: string, user: AuthUser) {
    const job = await this.jobs.findVisible(id, hiringScopeOf(user));
    if (!job) throw notFound('job');
    return job;
  }
}

const invalidRecruiter = () => new AppError('job.invalid_recruiter', 'The recruiter must be an active employee');

/** Status actions and the recruiter choice are offered to full access only (frontend `canManage`). */
const viewerOf = (user: AuthUser) => ({
  canEdit: hasFullHiringAccess(user) && hasPermission(user.permissions, PERMISSIONS.hiring.jobs, 'edit'),
});
