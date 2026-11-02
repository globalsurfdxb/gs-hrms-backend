import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, forbidden, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay } from '../../../shared/time/calendar-day.js';
import type { ChangeRecruiterDto } from '../api/dto/change-recruiter.dto.js';
import type { CreateJobDto } from '../api/dto/create-job.dto.js';
import { JobDetailResponse, JobListResponse, JobResponse, RecruiterPoolResponse } from '../api/dto/job.response.js';
import type { ListJobsQuery } from '../api/dto/list-jobs.query.js';
import { assertCanCreateJob, checkJobInput, jobHistory, jobStatusAfter, type JobAction } from '../domain/job.rules.js';
import { canChooseRecruiter, canRecruit, handsOver, type RecruiterActor } from '../domain/recruiter.rules.js';
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
      {
        status: query.status,
        locationId: query.locationId,
        recruiterId: query.recruiterId,
        awaitingRecruiter: query.awaitingRecruiter,
      },
      page,
      pageSize,
    );
    const viewer = await this.viewerOf(user);
    return { items: items.map((j) => JobResponse.from(j, viewer)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<JobDetailResponse> {
    return JobDetailResponse.fromDetail(await this.found(id, user), await this.viewerOf(user));
  }

  /** BR-HIR-021: who a new job goes to, and who can be chosen to run it — for the job form and the recruiter
      drawer. With no TA Manager the pool is empty and any active employee may be chosen. */
  async recruiters(user: AuthUser): Promise<RecruiterPoolResponse> {
    const [taManager, pool, actor] = await Promise.all([
      this.jobs.talentManager(),
      this.jobs.recruiterPool(),
      this.actorOf(user),
    ]);
    return RecruiterPoolResponse.from(taManager, taManager ? pool : [], handsOver(actor, taManager));
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
    const active = await this.jobs.activeEmployees(input.panelIds);
    if (input.panelIds.some((p) => !active.has(p))) {
      throw new AppError('job.invalid_panel', 'Every interviewer must be an active employee');
    }

    // BR-HIR-021: with a TA Manager in place the job goes to them to choose the recruiter, unless they (or a Super
    // Admin) are creating it.
    const taManager = await this.jobs.talentManager();
    const handOver = handsOver(await this.actorOf(user), taManager);
    if (handOver && dto.recruiterId) {
      throw new AppError(
        'job.recruiter_chosen_by_ta',
        `${taManager!.fullName} (Talent Acquisition Manager) chooses the recruiter for this job — leave it empty`,
      );
    }
    if (!handOver && !dto.recruiterId) throw new AppError('job.recruiter_required', 'Choose a recruiter');
    if (dto.recruiterId) await this.recruiter(dto.recruiterId, !!taManager);

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
        recruiterId: handOver ? null : dto.recruiterId!,
        taManagerId: taManager?.id ?? null,
        status,
      },
      input.panelIds,
      [jobHistory.created(req.code, status), ...(handOver ? [jobHistory.handedOver(taManager!.fullName)] : [])],
      actorOf(user),
    );
    // The TA Manager is told once core/notifications exists (frontend: "JOB-x needs a recruiter").
    return JobDetailResponse.fromDetail(job, await this.viewerOf(user));
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
    return JobDetailResponse.fromDetail(job, await this.viewerOf(user));
  }

  /** BR-HIR-021: choose or change the recruiter — Super Admin, a TA Manager, or (on a job with no TA Manager) full
      hiring access. With a TA Manager in place the recruiter comes from the Talent Acquisition team. */
  async changeRecruiter(id: string, dto: ChangeRecruiterDto, user: AuthUser): Promise<JobDetailResponse> {
    const before = await this.found(id, user);
    const viewer = await this.viewerOf(user);
    if (!viewer.canChooseRecruiter(before)) {
      throw forbidden('job.recruiter_not_allowed', 'Only the Talent Acquisition Manager can choose the recruiter');
    }
    if (before.recruiter?.id === dto.recruiterId) return JobDetailResponse.fromDetail(before, viewer);
    const next = await this.recruiter(dto.recruiterId, !!(await this.jobs.talentManager()));
    // The new recruiter is told once core/notifications exists (frontend: "You are now the recruiter for JOB-x").
    const job = await this.jobs.change(
      before,
      { recruiterId: next.id },
      jobHistory.recruiter(before.recruiter?.fullName ?? null, next.fullName),
      {
        action: before.recruiter ? 'job.recruiter_changed' : 'job.recruiter_chosen',
        before: { recruiterId: before.recruiter?.id ?? null },
        after: { recruiterId: next.id },
      },
      actorOf(user),
    );
    return JobDetailResponse.fromDetail(job, viewer);
  }

  private async found(id: string, user: AuthUser) {
    const job = await this.jobs.findVisible(id, hiringScopeOf(user));
    if (!job) throw notFound('job');
    return job;
  }

  /** An active employee who may run a job: from the Talent Acquisition team once there is one. */
  private async recruiter(id: string, teamExists: boolean) {
    const e = await this.jobs.activeEmployee(id);
    if (!e) throw new AppError('job.invalid_recruiter', 'The recruiter must be an active employee');
    if (!canRecruit(e.designation?.title ?? null, teamExists)) {
      throw new AppError('job.invalid_recruiter', 'Choose the recruiter from the Talent Acquisition team');
    }
    return e;
  }

  private async actorOf(user: AuthUser): Promise<RecruiterActor> {
    return {
      employeeId: user.employeeId,
      roleName: user.roleName,
      designation: await this.jobs.designationOf(user.employeeId),
    };
  }

  /** Status actions are offered to full access only (frontend `canManage`); the recruiter choice per BR-HIR-021. */
  private async viewerOf(user: AuthUser) {
    const actor = await this.actorOf(user);
    const canEdit = hasPermission(user.permissions, PERMISSIONS.hiring.jobs, 'edit');
    const full = hasFullHiringAccess(user);
    return {
      canEdit: full && canEdit,
      canChooseRecruiter: (j: { taManager: { id: string } | null }) =>
        canEdit && canChooseRecruiter(actor, { taManagerId: j.taManager?.id ?? null }, full),
    };
  }
}
