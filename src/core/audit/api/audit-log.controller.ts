import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser, HrmsRequest } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { ApiErrors } from '../../http/api-docs.js';
import { RequirePermission } from '../../iam/access.decorators.js';
import { PERMISSIONS } from '../../iam/permission-catalog.js';
import { AuditQueryService, EXPORT_MAX_ROWS } from '../audit-query.service.js';
import { ExportAuditQuery, ListAuditQuery } from './audit-log.query.js';
import { AuditFiltersResponse, AuditLogListResponse } from './audit-log.response.js';

const FEATURE = PERMISSIONS.administration.audit;

/* Administration → Audit Logs. Read-only: the audit trail is append-only and has no write API. */
@ApiTags('Administration · Audit log')
@ApiCookieAuth()
@Controller('admin/audit')
export class AuditLogController {
  constructor(private readonly audit: AuditQueryService) {}

  @RequirePermission(FEATURE)
  @Get()
  @ApiOperation({
    summary: 'List audit events',
    description:
      'Needs Audit Logs → View (Super Admin, HR, Office Admin by default). Newest first, paged. Filters combine; ' +
      '`q` searches the actor, module, action and entity. Group by day on the client from `at`.',
  })
  @ApiOkResponse({ type: AuditLogListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListAuditQuery) {
    return this.audit.list(query);
  }

  @RequirePermission(FEATURE)
  @Get('filters')
  @ApiOperation({
    summary: 'Audit filter values',
    description: 'Needs Audit Logs → View. The modules, actions and people that appear in the log, for dropdowns.',
  })
  @ApiOkResponse({ type: AuditFiltersResponse })
  @ApiErrors(401, 403)
  filters() {
    return this.audit.filters();
  }

  @RequirePermission(FEATURE)
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export audit events as CSV',
    description:
      `Needs Audit Logs → View. Same filters as the list, newest first, at most ${EXPORT_MAX_ROWS} rows ` +
      '(400 audit.export_too_large — narrow the filters). The export itself is audited (Security · audit.exported).',
  })
  @ApiOkResponse({ description: 'CSV file', schema: { type: 'string' } })
  @ApiErrors(400, 401, 403)
  async export(
    @Query() query: ExportAuditQuery,
    @CurrentUser() user: AuthUser,
    @Req() req: HrmsRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.audit.exportCsv(query, user, req.ip);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return csv;
  }
}
