import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { hasPermission, PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { AppError, forbidden, notFound } from '../../../shared/errors/app-error.js';
import type { ApplyToJobDto, CandidateNoteDto, CandidateTagsDto } from '../api/dto/candidate-actions.dto.js';
import type { DuplicatesQuery, ListCandidatesQuery } from '../api/dto/candidate-queries.js';
import { ApplicationDetailResponse } from '../api/dto/application.response.js';
import {
  CandidateDetailResponse,
  CandidateListResponse,
  CandidateResponse,
  DuplicateCandidateResponse,
} from '../api/dto/candidate.response.js';
import type { CreateCandidateDto } from '../api/dto/create-candidate.dto.js';
import { assertCanApply } from '../domain/application.rules.js';
import { checkCandidateInput, duplicateKeys, normaliseTags } from '../domain/candidate.rules.js';
import { canSeeSalary, type HiringScope, type JobParties } from '../domain/job-scope.js';
import { ApplicationsRepository } from '../infrastructure/applications.repository.js';
import { CandidatesRepository, type CandidateDetailRecord } from '../infrastructure/candidates.repository.js';
import { hiringScopeOf } from './hiring-access.js';

/* Use cases for candidates (spec docs/modules/hiring.md, step 3). No HTTP and no Prisma here. Full hiring access sees
   every candidate; anyone else only candidates on their own jobs, and only those applications (BR-HIR-022) — another
   candidate is a 404. Salary only for full access or the hiring manager / recruiter of one of the candidate's jobs
   (spec §6, frontend canSeeSalary). */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidates: CandidatesRepository,
    private readonly applications: ApplicationsRepository,
  ) {}

  async list(query: ListCandidatesQuery, user: AuthUser): Promise<CandidateListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.candidates.list(
      hiringScopeOf(user),
      {
        q: query.q?.trim() || undefined,
        jobId: query.jobId,
        stage: query.stage,
        source: query.source,
        tag: query.tag?.trim() || undefined,
        locationId: query.locationId,
      },
      page,
      pageSize,
    );
    return { items: items.map(CandidateResponse.from), total, page, pageSize };
  }

  async get(id: string, user: AuthUser): Promise<CandidateDetailResponse> {
    const c = await this.found(id, user);
    const viewer = viewerOf(user, c);
    if (viewer.canSeeSalary && (c.currentSalary || c.expectedSalary)) {
      await this.candidates.recordSalaryView(c.id, actorOf(user));
    }
    return CandidateDetailResponse.fromDetail(c, viewer);
  }

  /** BR-HIR-007: the form's "already in the system" warning — only candidates the caller may see, so the check
      never reveals who else is on file (BR-HIR-022). */
  async duplicates(query: DuplicatesQuery, user: AuthUser): Promise<DuplicateCandidateResponse[]> {
    const scope = hiringScopeOf(user);
    const rows = await this.candidates.duplicates(duplicateKeys(query.email ?? '', query.phone ?? ''));
    const visible = await Promise.all(rows.map((r) => this.candidates.isVisible(r.id, scope)));
    return rows.filter((_, i) => visible[i]).map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone }));
  }

  /** BR-HIR-007 (+ BR-HIR-008 when a job is given): add a candidate, optionally straight onto an open job. */
  async create(dto: CreateCandidateDto, user: AuthUser): Promise<CandidateDetailResponse> {
    const scope = hiringScopeOf(user);
    // Without full access a candidate goes straight onto one of the caller's jobs — otherwise they could not see them.
    if (!scope.all && !dto.jobId) {
      throw new AppError('candidate.job_required', 'Choose one of your open jobs for this candidate');
    }
    const job = dto.jobId ? await this.applications.job(dto.jobId, scope) : null;
    if (dto.jobId && !job) throw notFound('job');
    if (job) assertCanApply(job, false);

    const salaryGiven = dto.currentSalary !== undefined || dto.expectedSalary !== undefined;
    if (salaryGiven && !canSeeSalary(scope, job ? [partiesOf(job)] : [])) {
      throw forbidden('candidate.salary_not_allowed', 'You cannot enter salary for this candidate');
    }

    let location: { id: string; currency: string };
    if (job) {
      location = { id: job.requisition.locationId, currency: job.requisition.location.currency };
    } else {
      if (!dto.locationId) throw new AppError('candidate.location_required', 'Choose a job or a location');
      const found = await this.candidates.location(dto.locationId);
      if (!found) throw new AppError('candidate.unknown_location', `Unknown location "${dto.locationId}"`);
      location = found;
    }

    const checked = checkCandidateInput({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      source: dto.source,
      referrerId: dto.referrerId ?? null,
      agency: dto.agency ?? null,
      consent: dto.consent,
      tags: dto.tags ?? [],
    });
    if (checked.referrerId && !(await this.candidates.isActiveEmployee(checked.referrerId))) {
      throw new AppError('candidate.invalid_referrer', 'The referrer must be an active employee');
    }
    const [dup] = await this.candidates.duplicates(duplicateKeys(checked.email, checked.phone));
    if (dup && !(await this.candidates.isVisible(dup.id, scope))) {
      // Someone the caller may not see: say so without naming or pointing at them (BR-HIR-022).
      throw new AppError(
        'candidate.duplicate',
        'Someone with this email or phone number is already in the system. Ask HR or the Talent Acquisition team ' +
          'to add them to your job.',
        409,
      );
    }
    if (dup) {
      throw new AppError(
        'candidate.duplicate',
        `${dup.name} is already in the system with the same email or phone number`,
        409,
        { candidateId: dup.id },
      );
    }

    const created = await this.candidates.create(
      {
        ...checked,
        locationId: location.id,
        currentCity: dto.currentCity?.trim() ?? '',
        currentCompany: dto.currentCompany?.trim() ?? '',
        currentTitle: dto.currentTitle?.trim() ?? '',
        experienceYears: dto.experienceYears,
        noticeDays: dto.noticeDays ?? 0,
        currentSalary: dto.currentSalary ?? null,
        expectedSalary: dto.expectedSalary ?? null,
        currency: location.currency,
        visaStatus: dto.visaStatus?.trim() ?? '',
        source: dto.source,
        cvName: dto.cvName ?? null,
        links: dto.links?.trim() ?? '',
      },
      dto.note?.trim() || null,
      job?.id ?? null,
      actorOf(user),
      scope,
    );
    return CandidateDetailResponse.fromDetail(created, viewerOf(user, created));
  }

  /** BR-HIR-008: add an existing candidate to an open job. */
  async apply(candidateId: string, dto: ApplyToJobDto, user: AuthUser): Promise<ApplicationDetailResponse> {
    await this.found(candidateId, user);
    const job = await this.applications.job(dto.jobId, hiringScopeOf(user));
    if (!job) throw notFound('job');
    assertCanApply(job, await this.applications.exists(candidateId, job.id));
    const created = await this.applications.create(candidateId, job.id, actorOf(user));
    return ApplicationDetailResponse.fromDetail(created, { canEdit: canEdit(user) });
  }

  async setTags(id: string, dto: CandidateTagsDto, user: AuthUser): Promise<CandidateDetailResponse> {
    const before = await this.found(id, user);
    const tags = normaliseTags(dto.tags);
    if (tags.join('\n') === before.tags.join('\n'))
      return CandidateDetailResponse.fromDetail(before, viewerOf(user, before));
    const saved = await this.candidates.setTags(before, tags, actorOf(user), hiringScopeOf(user));
    return CandidateDetailResponse.fromDetail(saved, viewerOf(user, saved));
  }

  async addNote(id: string, dto: CandidateNoteDto, user: AuthUser): Promise<CandidateDetailResponse> {
    await this.found(id, user);
    const text = dto.text.trim();
    if (!text) throw new AppError('candidate.note_required', 'Write a note');
    const saved = await this.candidates.addNote(id, text, actorOf(user), hiringScopeOf(user));
    return CandidateDetailResponse.fromDetail(saved, viewerOf(user, saved));
  }

  private async found(id: string, user: AuthUser): Promise<CandidateDetailRecord> {
    const c = await this.candidates.findVisible(id, hiringScopeOf(user));
    if (!c) throw notFound('candidate');
    return c;
  }
}

const partiesOf = (job: { recruiterId: string | null; requisition: { hiringManagerId: string } }): JobParties => ({
  hiringManagerId: job.requisition.hiringManagerId,
  recruiterId: job.recruiterId,
});

const canEdit = (user: AuthUser) => hasPermission(user.permissions, PERMISSIONS.hiring.candidates, 'edit');

const viewerOf = (user: AuthUser, c: CandidateDetailRecord) => {
  const scope: HiringScope = hiringScopeOf(user);
  return {
    canEdit: canEdit(user),
    canAddApplication: hasPermission(user.permissions, PERMISSIONS.hiring.candidates, 'add'),
    canSeeSalary: canSeeSalary(
      scope,
      c.applications.map((a) => partiesOf(a.job)),
    ),
  };
};
