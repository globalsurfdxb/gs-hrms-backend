import { Global, Module } from '@nestjs/common';
import { AuditLogController } from './api/audit-log.controller.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditService } from './audit.service.js';

/* Write side: AuditService, used by every module. Read side: GET /admin/audit (list, filter values, CSV export).
   Still to do: view-access logging for sensitive records. */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
