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
import { ApplicationsRepository } from '../infrastructure/applications.repository.js';
import { CandidatesRepository, type CandidateDetailRecord } from '../infrastructure/candidates.repository.js';

/* Use cases for candidates (spec docs/modules/hiring.md, step 3). No HTTP and no Prisma here. Candidates → View
   holders see every candidate; salary only for salary access (Jobs → View: HR, Super Admin) or the hiring manager of
   one of the candidate's jobs (spec §6, frontend canSeeSalary). */
@Injectable()
export class CandidatesService {
  constructor(
    private readonly candidates: CandidatesRepository,
    private readonly applications: ApplicationsRepository,
  ) {}

  async list(query: ListCandidatesQuery, _user: AuthUser): Promise<CandidateListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { items, total } = await this.candidates.list(
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
    const c = await this.found(id);
    const viewer = viewerOf(user, c);
    if (viewer.canSeeSalary && (c.currentSalary || c.expectedSalary)) {
      await this.candidates.recordSalaryView(c.id, actorOf(user));
    }
    return CandidateDetailResponse.fromDetail(c, viewer);
  }

  /** BR-HIR-007: the form's "already in the system" warning. */
  async duplicates(query: DuplicatesQuery): Promise<DuplicateCandidateResponse[]> {
    const rows = await this.candidates.duplicates(duplicateKeys(query.email ?? '', query.phone ?? ''));
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone }));
  }

  /** BR-HIR-007 (+ BR-HIR-008 when a job is given): add a candidate, optionally straight onto an open job. */
  async create(dto: CreateCandidateDto, user: AuthUser): Promise<CandidateDetailResponse> {
    const job = dto.jobId ? await this.applications.job(dto.jobId) : null;
    if (dto.jobId && !job) throw notFound('job');
    if (job) assertCanApply(job, false);

    const salaryGiven = dto.currentSalary !== undefined || dto.expectedSalary !== undefined;
    if (salaryGiven && !seesAllSalary(user) && job?.requisition.hiringManagerId !== user.employeeId) {
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
    );
    return CandidateDetailResponse.fromDetail(created, viewerOf(user, created));
  }

  /** BR-HIR-008: add an existing candidate to an open job. */
  async apply(candidateId: string, dto: ApplyToJobDto, user: AuthUser): Promise<ApplicationDetailResponse> {
    await this.found(candidateId);
    const job = await this.applications.job(dto.jobId);
    if (!job) throw notFound('job');
    assertCanApply(job, await this.applications.exists(candidateId, job.id));
    const created = await this.applications.create(candidateId, job.id, actorOf(user));
    return ApplicationDetailResponse.fromDetail(created, { canEdit: canEdit(user) });
  }

  async setTags(id: string, dto: CandidateTagsDto, user: AuthUser): Promise<CandidateDetailResponse> {
    const before = await this.found(id);
    const tags = normaliseTags(dto.tags);
    if (tags.join('\n') === before.tags.join('\n'))
      return CandidateDetailResponse.fromDetail(before, viewerOf(user, before));
    const saved = await this.candidates.setTags(before, tags, actorOf(user));
    return CandidateDetailResponse.fromDetail(saved, viewerOf(user, saved));
  }

  async addNote(id: string, dto: CandidateNoteDto, user: AuthUser): Promise<CandidateDetailResponse> {
    await this.found(id);
    const text = dto.text.trim();
    if (!text) throw new AppError('candidate.note_required', 'Write a note');
    const saved = await this.candidates.addNote(id, text, actorOf(user));
    return CandidateDetailResponse.fromDetail(saved, viewerOf(user, saved));
  }

  private async found(id: string): Promise<CandidateDetailRecord> {
    const c = await this.candidates.findById(id);
    if (!c) throw notFound('candidate');
    return c;
  }
}

/** HR and Super Admin (Jobs → View) see every candidate's salary. */
const seesAllSalary = (user: AuthUser) => hasPermission(user.permissions, PERMISSIONS.hiring.jobs);

const canEdit = (user: AuthUser) => hasPermission(user.permissions, PERMISSIONS.hiring.candidates, 'edit');

const viewerOf = (user: AuthUser, c: CandidateDetailRecord) => ({
  canEdit: canEdit(user),
  canAddApplication: hasPermission(user.permissions, PERMISSIONS.hiring.candidates, 'add'),
  canSeeSalary:
    seesAllSalary(user) || c.applications.some((a) => a.job.requisition.hiringManagerId === user.employeeId),
});
