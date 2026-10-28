import { ApiProperty } from '@nestjs/swagger';
import type { AuditLog } from '../../../generated/prisma/client.js';

export class AuditActorResponse {
  @ApiProperty({ nullable: true, type: String, description: 'null for system jobs and failed sign-ins' })
  id: string | null;
  @ApiProperty({ example: 'Dev HR', description: 'Name at the time, "system", or the attempted sign-in' })
  label: string;
}

/* Explicit response shape. `before`/`after` hold changed fields only and never decrypted sensitive values. */
export class AuditLogResponse {
  @ApiProperty({ example: '1042' }) id: string;
  @ApiProperty({ example: '2026-10-28T09:15:02.123Z' }) at: string;
  @ApiProperty({ type: AuditActorResponse }) actor: AuditActorResponse;
  @ApiProperty({ example: 'Organization' }) module: string;
  @ApiProperty({ example: 'company.updated' }) action: string;
  @ApiProperty({ example: 'company' }) entityType: string;
  @ApiProperty({ nullable: true, type: String }) entityId: string | null;
  @ApiProperty({ nullable: true, type: Object, example: { status: 'ACTIVE' } }) before: unknown;
  @ApiProperty({ nullable: true, type: Object, example: { status: 'INACTIVE' } }) after: unknown;
  @ApiProperty({ nullable: true, type: String }) ip: string | null;

  static from(this: void, a: AuditLog): AuditLogResponse {
    return {
      id: a.id.toString(),
      at: a.at.toISOString(),
      actor: { id: a.actorId, label: a.actorLabel },
      module: a.module,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: a.before,
      after: a.after,
      ip: a.ip,
    };
  }
}

export class AuditLogListResponse {
  @ApiProperty({ type: [AuditLogResponse], description: 'Newest first' }) items: AuditLogResponse[];
  @ApiProperty({ example: 340 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 50 }) pageSize: number;
}

export class AuditFiltersResponse {
  @ApiProperty({ type: [String], example: ['Organization', 'Security'] }) modules: string[];
  @ApiProperty({ type: [String], example: ['auth.sign_in', 'company.created'] }) actions: string[];
  @ApiProperty({ type: [AuditActorResponse], description: 'People who acted, with their latest name' })
  actors: AuditActorResponse[];
}
