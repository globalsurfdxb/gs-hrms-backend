import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { ApplicationsService } from '../application/applications.service.js';
import { ExitApplicationDto, MoveApplicationDto } from './dto/application-actions.dto.js';
import { ApplicationDetailResponse, ApplicationListResponse } from './dto/application.response.js';
import { ListApplicationsQuery } from './dto/candidate-queries.js';

const FEATURE = PERMISSIONS.hiring.candidates;
const OFFER_OUT = 'While the offer letter is out with the candidate this is refused (409 application.offer_out).';

@ApiTags('Hiring · Pipeline')
@ApiCookieAuth()
@Controller('hiring')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @RequirePermission(FEATURE)
  @Get('jobs/:id/applications')
  @ApiOperation({
    summary: 'List a job’s pipeline',
    description:
      'Needs Candidates → View (HR, Super Admin by default). The job’s applications with the candidate behind each, ' +
      'for the board and the list. stage = active applications at that stage; exit = an exit or NONE; ' +
      'inStageForDays finds stalled candidates. Sort by applied (default, newest first), name, stage or inStage.',
  })
  @ApiOkResponse({ type: ApplicationListResponse })
  @ApiErrors(400, 401, 403, 404)
  forJob(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListApplicationsQuery, @CurrentUser() user: AuthUser) {
    return this.applications.forJob(id, query, user);
  }

  @RequirePermission(FEATURE)
  @Get('applications/:id')
  @ApiOperation({ summary: 'Get one application', description: 'Needs Candidates → View. With its stage history.' })
  @ApiOkResponse({ type: ApplicationDetailResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.applications.get(id, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('applications/:id/move')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move a candidate to another stage',
    description:
      'Needs Candidates → Edit. Any stage from APPLIED to OFFER, forward or back; also brings an exited candidate ' +
      'back. Never HIRED (an accepted offer sets it), nothing after HIRED, and not while the job is CLOSED or ' +
      `FILLED (BR-HIR-009). ${OFFER_OUT} Bulk moves: one call per application.`,
  })
  @ApiOkResponse({ type: ApplicationDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveApplicationDto, @CurrentUser() user: AuthUser) {
    return this.applications.move(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('applications/:id/exit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject, withdraw or put a candidate on hold',
    description:
      'Needs Candidates → Edit. REJECTED needs one of the rejection reasons; WITHDRAWN and ON_HOLD take a free ' +
      `reason. Not after HIRED (BR-HIR-009). ${OFFER_OUT} Bulk reject: one call per application.`,
  })
  @ApiOkResponse({ type: ApplicationDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  exit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExitApplicationDto, @CurrentUser() user: AuthUser) {
    return this.applications.exit(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('applications/:id/reopen')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reopen an exited application',
    description:
      'Needs Candidates → Edit. Back to the stage it left from; not while the job is CLOSED or FILLED (BR-HIR-009).',
  })
  @ApiOkResponse({ type: ApplicationDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.applications.reopen(id, user);
  }
}
