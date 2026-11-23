import { Injectable } from '@nestjs/common';
import { actorOf, type AuditActor } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError, conflict, notFound } from '../../../shared/errors/app-error.js';
import type { CreateDesignationDto } from '../api/dto/create-designation.dto.js';
import { DesignationResponse } from '../api/dto/designation.response.js';
import type { ListDesignationsQuery } from '../api/dto/list-designations.query.js';
import type { UpdateDesignationDto } from '../api/dto/update-designation.dto.js';
import { assertDesignationDeletable } from '../domain/department.rules.js';
import { DesignationsRepository, type DesignationRecord } from '../infrastructure/designations.repository.js';

/* Use cases for designations (job titles within a department). No HTTP and no Prisma here. */
@Injectable()
export class DesignationsService {
  constructor(private readonly designations: DesignationsRepository) {}

  async list(query: ListDesignationsQuery): Promise<DesignationResponse[]> {
    return (await this.designations.findAll(query)).map(DesignationResponse.from);
  }

  async get(id: string): Promise<DesignationResponse> {
    return DesignationResponse.from(await this.found(id));
  }

  async create(dto: CreateDesignationDto, user: AuthUser): Promise<DesignationResponse> {
    if (!(await this.designations.departmentExists(dto.departmentId))) {
      throw new AppError('designation.unknown_department', 'Unknown department');
    }
    const title = dto.title.trim();
    await this.checkTitleFree(dto.departmentId, title);
    return DesignationResponse.from(
      await this.designations.create({ departmentId: dto.departmentId, title }, actorOf(user)),
    );
  }

  /** For the hiring module (BR-HIR-020): when a requisition that proposed a new designation is approved, the title
      joins its department — or the existing one with that title (any case) is used. Runs in the approval's
      transaction, so both commit together (a deliberate exception to "side effects through events": there is no
      event bus yet and the two must not drift apart). The caller has already checked who may approve. */
  ensureForApprovedRequisition(
    tx: Prisma.TransactionClient,
    departmentId: string,
    title: string,
    requisitionCode: string,
    actor: AuditActor,
  ): Promise<{ id: string; created: boolean }> {
    return this.designations.ensure(tx, { departmentId, title: title.trim() }, `requisition ${requisitionCode}`, actor);
  }

  async update(id: string, dto: UpdateDesignationDto, user: AuthUser): Promise<DesignationResponse> {
    const before = await this.found(id);
    const title = dto.title.trim();
    if (title === before.title) return DesignationResponse.from(before);
    await this.checkTitleFree(before.departmentId, title, id);
    return DesignationResponse.from(await this.designations.rename(id, before.title, title, actorOf(user)));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const before = await this.found(id);
    await this.designations.delete(id, before, actorOf(user), assertDesignationDeletable);
  }

  private async found(id: string): Promise<DesignationRecord> {
    const designation = await this.designations.findById(id);
    if (!designation) throw notFound('designation');
    return designation;
  }

  private async checkTitleFree(departmentId: string, title: string, exceptId?: string) {
    if (await this.designations.titleTaken(departmentId, title, exceptId)) {
      throw conflict('designation.title_taken', `The department already has a designation called "${title}"`);
    }
  }
}
