import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { notFound } from '../../../shared/errors/app-error.js';
import type { ExitApplicationDto, MoveApplicationDto } from '../api/dto/application-actions.dto.js';
import {
  ApplicationDetailResponse,
  ApplicationListResponse,
  ApplicationResponse,
} from '../api/dto/application.response.js';
import type { ListApplicationsQuery } from '../api/dto/candidate-queries.js';
import {
  exitApplication,
  moveStage,
  reopenApplication,
  type PipelineChange,
  type PipelineState,
} from '../domain/application.rules.js';
import { ApplicationsRepository, type ApplicationDetailRecord } from '../infrastructure/applications.repository.js';

/* Use cases for the pipeline (spec docs/modules/hiring.md, step 3, BR-HIR-009). No HTTP and no Prisma here.
   Candidates → View holders see every application; moving needs Candidates → Edit (checked by the route). */
@Injectable()
export class ApplicationsService {
  constructor(private readonly applications: ApplicationsRepository) {}

  /** A job's pipeline, for the board and the list. */
  async forJob(jobId: string, query: ListApplicationsQuery, user: AuthUser): Promise<ApplicationListResponse> {
    if (!(await this.applications.job(jobId))) throw notFound('job');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.applications.forJob(
      jobId,
      {
        stage: query.stage,
        exit: query.exit,
        q: query.q?.trim() || undefined,
        source: query.source,
        tag: query.tag?.trim() || undefined,
        appliedWithinDays: query.appliedWithinDays,
        inStageForDays: query.inStageForDays,
        sort: query.sort ?? 'applied',
        dir: query.dir ?? 'desc',
      },
      page,
      pageSize,
    );
    const viewer = viewerOf(user);
    return { items: items.map((a) => ApplicationResponse.fromRow(a, viewer)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<ApplicationDetailResponse> {
    return ApplicationDetailResponse.fromDetail(await this.found(id), viewerOf(user));
  }

  async move(id: string, dto: MoveApplicationDto, user: AuthUser): Promise<ApplicationDetailResponse> {
    const before = await this.found(id);
    return this.apply(
      before,
      moveStage(await this.stateOf(before), dto.stage, dto.note ?? null),
      'application.moved',
      user,
    );
  }

  async exit(id: string, dto: ExitApplicationDto, user: AuthUser): Promise<ApplicationDetailResponse> {
    const before = await this.found(id);
    const change = exitApplication(await this.stateOf(before), dto.exit, dto.reason ?? null, dto.note ?? null);
    return this.apply(before, change, 'application.exited', user);
  }

  async reopen(id: string, user: AuthUser): Promise<ApplicationDetailResponse> {
    const before = await this.found(id);
    return this.apply(before, reopenApplication(await this.stateOf(before)), 'application.reopened', user);
  }

  /* ---------------------------------------------------------------- helpers */

  private async apply(
    before: ApplicationDetailRecord,
    change: PipelineChange | null,
    action: string,
    user: AuthUser,
  ): Promise<ApplicationDetailResponse> {
    if (!change) return ApplicationDetailResponse.fromDetail(before, viewerOf(user));
    const saved = await this.applications.change(before, change, action, actorOf(user));
    return ApplicationDetailResponse.fromDetail(saved, viewerOf(user));
  }

  private async stateOf(a: ApplicationDetailRecord): Promise<PipelineState> {
    return {
      stage: a.stage,
      exit: a.exit,
      exitFrom: a.exitFrom,
      jobStatus: a.job.status,
      offerSent: await this.applications.offerSent(a.id),
    };
  }

  private async found(id: string): Promise<ApplicationDetailRecord> {
    const a = await this.applications.findById(id);
    if (!a) throw notFound('application');
    return a;
  }
}

const viewerOf = (user: AuthUser) => ({
  canEdit: hasPermission(user.permissions, PERMISSIONS.hiring.candidates, 'edit'),
});
