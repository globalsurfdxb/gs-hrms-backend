import { Injectable } from '@nestjs/common';
import { AuditService, type AuditActor } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { JobStatus, Prisma } from '../../../generated/prisma/client.js';
import { conflict } from '../../../shared/errors/app-error.js';
import { PERSON } from './requisitions.repository.js';

export interface JobData {
  requisitionId: string;
  designationId: string | null;
  description: string;
  skills: string[];
  expMin: number;
  expMax: number;
  qualifications: string;
  referralEligible: boolean;
  closingDate: Date;
  recruiterId: string;
  status: JobStatus;
}

export interface JobFilter {
  status?: JobStatus;
  locationId?: string;
  recruiterId?: string;
}

const JOB = {
  id: true,
  code: true,
  status: true,
  filled: true,
  description: true,
  skills: true,
  expMin: true,
  expMax: true,
  qualifications: true,
  referralEligible: true,
  closingDate: true,
  createdAt: true,
  updatedAt: true,
  designation: { select: { id: true, title: true } },
  recruiter: PERSON,
  createdBy: PERSON,
  panel: { select: { employee: PERSON }, orderBy: { employee: { fullName: 'asc' } } },
  // Read from the requisition: it cannot change once approved.
  requisition: {
    select: {
      id: true,
      code: true,
      title: true,
      positions: true,
      employmentType: true,
      budgetMin: true,
      budgetMax: true,
      currency: true,
      company: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      hiringManager: PERSON,
    },
  },
} as const satisfies Prisma.JobSelect;

const JOB_DETAIL = {
  ...JOB,
  events: { select: { id: true, at: true, actorLabel: true, text: true }, orderBy: { at: 'asc' } },
} as const satisfies Prisma.JobSelect;

export type JobRecord = Prisma.JobGetPayload<{ select: typeof JOB }>;
export type JobDetailRecord = Prisma.JobGetPayload<{ select: typeof JOB_DETAIL }>;

const AUDIT = { module: 'Hiring', entityType: 'job' } as const;

/* The only place the hiring module touches Prisma for jobs. Every change writes a History event (shown to users)
   and an audit row (append-only trail) in the same transaction, guarded against concurrent edits. */
@Injectable()
export class JobsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter: JobFilter, page: number, pageSize: number) {
    const where: Prisma.JobWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.recruiterId && { recruiterId: filter.recruiterId }),
      ...(filter.locationId && { requisition: { locationId: filter.locationId } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        select: JOB,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.job.findUnique({ where: { id }, select: JOB_DETAIL });
  }

  /** The requisition a job would be created from. */
  requisition(id: string) {
    return this.prisma.requisition.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        departmentId: true,
        designationId: true,
        job: { select: { id: true } },
      },
    });
  }

  designation(id: string) {
    return this.prisma.designation.findUnique({ where: { id }, select: { id: true, departmentId: true } });
  }

  /** Of the given ids, those that are ACTIVE employees (recruiter and panel must be). */
  async activeEmployees(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: ids }, employmentStatus: 'ACTIVE' },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  create(data: JobData, panelIds: string[], history: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const { id, code } = await tx.job.create({
        data: { ...data, createdById: actor.id!, panel: { create: panelIds.map((employeeId) => ({ employeeId })) } },
        select: { id: true, code: true },
      });
      await tx.jobEvent.create({ data: { jobId: id, actorId: actor.id, actorLabel: actor.label, text: history } });
      await this.audit.record(
        {
          ...AUDIT,
          actor,
          action: 'job.created',
          entityId: id,
          after: { code, ...data, closingDate: data.closingDate.toISOString().slice(0, 10), panelIds },
        },
        tx,
      );
      return tx.job.findUniqueOrThrow({ where: { id }, select: JOB_DETAIL });
    });
  }

  /** Applies a change, appends its History line and its audit row. */
  change(
    before: JobDetailRecord,
    data: Prisma.JobUncheckedUpdateManyInput,
    history: string,
    audit: { action: string; before: Prisma.InputJsonObject; after: Prisma.InputJsonObject },
    actor: AuditActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.job.updateMany({ where: { id: before.id, updatedAt: before.updatedAt }, data });
      if (count === 0) throw conflict('job.changed', 'This job was changed by someone else. Reload it and try again.');
      await tx.jobEvent.create({
        data: { jobId: before.id, actorId: actor.id, actorLabel: actor.label, text: history },
      });
      await this.audit.record({ ...AUDIT, actor, entityId: before.id, ...audit }, tx);
      return tx.job.findUniqueOrThrow({ where: { id: before.id }, select: JOB_DETAIL });
    });
  }
}
