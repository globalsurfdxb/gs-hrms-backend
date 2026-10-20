import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/* Phase 0 backlog: GET /admin/audit (filters: module, user, date range; CSV export via shared/security/csv.ts),
   view-access logging for sensitive records. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
