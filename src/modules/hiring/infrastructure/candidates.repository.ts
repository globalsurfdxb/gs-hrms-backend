import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { ApplicationStage, CandidateSource, Prisma } from '../../../generated/prisma/client.js';
import { conflict } from '../../../shared/errors/app-error.js';
import { appliedHistory } from '../domain/application.rules.js';
import { APPLICATION_SUMMARY, STAGE_HISTORY } from './applications.repository.js';
import { candidateSearch } from './candidate-search.js';
import { PERSON } from './requisitions.repository.js';

export interface CandidateData {
  name: string;
  email: string;
  phone: string;
  phoneKey: string;
  locationId: string;
  currentCity: string;
  currentCompany: string;
  currentTitle: string;
  experienceYears: number;
  noticeDays: number;
  /** Decimal as a string, e.g. "9000.00". */
  currentSalary: string | null;
  expectedSalary: string | null;
  currency: string;
  visaStatus: string;
  source: CandidateSource;
  referrerId: string | null;
  agency: string | null;
  cvName: string | null;
  links: string;
  tags: string[];
}

export interface CandidateFilter {
  q?: string;
  jobId?: string;
  stage?: ApplicationStage;
  source?: CandidateSource;
  tag?: string;
  locationId?: string;
}

const CANDIDATE = {
  id: true,
  name: true,
  email: true,
  phone: true,
  currentCompany: true,
  currentTitle: true,
  experienceYears: true,
  source: true,
  tags: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  applications: { select: APPLICATION_SUMMARY, orderBy: { appliedAt: 'desc' } },
} as const satisfies Prisma.CandidateSelect;

const CANDIDATE_DETAIL = {
  ...CANDIDATE,
  currentCity: true,
  noticeDays: true,
  currentSalary: true,
  expectedSalary: true,
  currency: true,
  visaStatus: true,
  agency: true,
  cvName: true,
  links: true,
  consentGivenAt: true,
  updatedAt: true,
  referrer: PERSON,
  createdBy: PERSON,
  notes: { select: { id: true, text: true, at: true, author: PERSON }, orderBy: { at: 'desc' } },
  applications: {
    select: { ...APPLICATION_SUMMARY, history: STAGE_HISTORY },
    orderBy: { appliedAt: 'desc' },
  },
} as const satisfies Prisma.CandidateSelect;

export type CandidateRecord = Prisma.CandidateGetPayload<{ select: typeof CANDIDATE }>;
export type CandidateDetailRecord = Prisma.CandidateGetPayload<{ select: typeof CANDIDATE_DETAIL }>;

const AUDIT = { module: 'Hiring', entityType: 'candidate' } as const;

/* The only place the hiring module touches Prisma for candidates. Candidates → View holders see every candidate,
   so there is no per-record scope yet (panelists and referrers arrive in step 4). Writes run in a transaction with
   their audit row; salary amounts never go into the audit log (spec Q8). */
@Injectable()
export class CandidatesRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: CandidateFilter, page: number, pageSize: number) {
    const app: Prisma.ApplicationWhereInput = {
      ...(filter.jobId && { jobId: filter.jobId }),
      ...(filter.stage && { stage: filter.stage, exit: null }),
    };
    const where: Prisma.CandidateWhereInput = {
      AND: [
        filter.q ? candidateSearch(filter.q) : {},
        filter.jobId || filter.stage ? { applications: { some: app } } : {},
        filter.source ? { source: filter.source } : {},
        filter.tag ? { tags: { has: filter.tag } } : {},
        filter.locationId ? { locationId: filter.locationId } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        select: CANDIDATE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.candidate.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.candidate.findUnique({ where: { id }, select: CANDIDATE_DETAIL });
  }

  /** Candidates with the same email or phone key (BR-HIR-007). */
  duplicates(keys: { email: string | null; phoneKey: string | null }) {
    const or: Prisma.CandidateWhereInput[] = [];
    if (keys.email) or.push({ email: keys.email });
    if (keys.phoneKey) or.push({ phoneKey: keys.phoneKey });
    if (!or.length) return Promise.resolve([]);
    return this.prisma.candidate.findMany({
      where: { OR: or },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
  }

  /* ---------------------------------------------------------------- reference checks */

  location(id: string) {
    return this.prisma.location.findUnique({ where: { id }, select: { id: true, currency: true } });
  }

  async isActiveEmployee(id: string): Promise<boolean> {
    const e = await this.prisma.employee.findUnique({ where: { id }, select: { employmentStatus: true } });
    return e?.employmentStatus === 'ACTIVE';
  }

  /* ---------------------------------------------------------------- writes */

  /** Adds the candidate with their consent time, the first note and, when jobId is given, the application. */
  create(data: CandidateData, note: string | null, jobId: string | null, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { id } = await tx.candidate
        .create({
          data: { ...data, consentGivenAt: new Date(), createdById: actor.id! },
          select: { id: true },
        })
        .catch(uniqueEmail);
      if (note) await tx.candidateNote.create({ data: { candidateId: id, text: note, authorId: actor.id! } });
      if (jobId) {
        await tx.application.create({
          data: {
            candidateId: id,
            jobId,
            createdById: actor.id!,
            history: { create: { ...appliedHistory, actorId: actor.id, actorLabel: actor.label } },
          },
        });
      }
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'candidate.created',
          entityId: id,
          after: auditable(data, jobId),
        },
        tx,
      );
      return tx.candidate.findUniqueOrThrow({ where: { id }, select: CANDIDATE_DETAIL });
    });
  }

  setTags(before: CandidateDetailRecord, tags: string[], actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.candidate.update({ where: { id: before.id }, data: { tags } });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'candidate.tags_changed',
          entityId: before.id,
          before: { tags: before.tags },
          after: { tags },
        },
        tx,
      );
      return tx.candidate.findUniqueOrThrow({ where: { id: before.id }, select: CANDIDATE_DETAIL });
    });
  }

  addNote(candidateId: string, text: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { id } = await tx.candidateNote.create({
        data: { candidateId, text, authorId: actor.id! },
        select: { id: true },
      });
      await tx.candidate.update({ where: { id: candidateId }, data: { updatedAt: new Date() } });
      // The note text stays on the candidate; the audit row records that a note was added.
      await this.audit.record(
        { ...AUDIT, actor, action: 'candidate.note_added', entityId: candidateId, after: { noteId: id } },
        tx,
      );
      return tx.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: CANDIDATE_DETAIL });
    });
  }

  /** A salary view (security.md §7: views of salary records are audited). */
  recordSalaryView(candidateId: string, actor: AuditActor) {
    return this.audit.record({ ...AUDIT, actor, action: 'candidate.salary_viewed', entityId: candidateId });
  }
}

/** Audit-friendly copy: no salary amounts (Q8), only whether they were given. */
function auditable(d: CandidateData, jobId: string | null): Prisma.InputJsonObject {
  const { currentSalary, expectedSalary, phoneKey: _key, ...rest } = d;
  return { ...rest, jobId, currentSalary: currentSalary ? 'set' : null, expectedSalary: expectedSalary ? 'set' : null };
}

/** The unique email index catches a duplicate added at the same moment as ours. */
function uniqueEmail(e: unknown): never {
  if ((e as { code?: string }).code === 'P2002') {
    throw conflict('candidate.duplicate', 'Someone with this email is already in the system');
  }
  throw e;
}
