import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { JobsService } from '../application/jobs.service.js';
import { ChangeRecruiterDto } from './dto/change-recruiter.dto.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobDetailResponse, JobListResponse } from './dto/job.response.js';
import { ListJobsQuery } from './dto/list-jobs.query.js';

const FEATURE = PERMISSIONS.hiring.jobs;
const STATUS_NOTE = 'FILLED is set by the system when every position is filled — never through these routes.';

@ApiTags('Hiring · Jobs')
@ApiCookieAuth()
@Controller('hiring')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @RequirePermission(FEATURE)
  @Get('jobs')
  @ApiOperation({
    summary: 'List jobs',
    description:
      'Needs Jobs → View (HR, Super Admin by default). Every job, newest first. Filters: status, location, recruiter.',
  })
  @ApiOkResponse({ type: JobListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListJobsQuery, @CurrentUser() user: AuthUser) {
    return this.jobs.list(query, user);
  }

  @RequirePermission(FEATURE)
  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get one job with its history',
    description: 'Needs Jobs → View (HR, Super Admin by default).',
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.get(id, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Post('requisitions/:id/job')
  @ApiOperation({
    summary: 'Create the job for an approved requisition',
    description:
      'Needs Jobs → Add (HR, Super Admin by default). Only from an APPROVED requisition that has no job yet (409 ' +
      'otherwise). Title, company, department, location, positions, budget and hiring manager come from the ' +
      'requisition. Recruiter and interviewers must be active employees. publish=true opens it now; otherwise DRAFT (BR-HIR-005).',
  })
  @ApiCreatedResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@Param('id', ParseUUIDPipe) requisitionId: string, @Body() dto: CreateJobDto, @CurrentUser() user: AuthUser) {
    return this.jobs.create(requisitionId, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('jobs/:id/open')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Open a draft job',
    description: `Needs Jobs → Edit. DRAFT → OPEN (BR-HIR-006). ${STATUS_NOTE}`,
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.changeStatus(id, 'open', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('jobs/:id/hold')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Put a job on hold',
    description: `Needs Jobs → Edit. OPEN → ON_HOLD (BR-HIR-006). ${STATUS_NOTE}`,
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  hold(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.changeStatus(id, 'hold', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('jobs/:id/resume')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resume a job on hold',
    description: `Needs Jobs → Edit. ON_HOLD → OPEN (BR-HIR-006). ${STATUS_NOTE}`,
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.changeStatus(id, 'resume', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('jobs/:id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Close a job',
    description: `Needs Jobs → Edit. OPEN or ON_HOLD → CLOSED (BR-HIR-006). ${STATUS_NOTE}`,
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.changeStatus(id, 'close', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post('jobs/:id/reopen')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reopen a closed job',
    description: `Needs Jobs → Edit. CLOSED → OPEN, only while positions are left to fill (BR-HIR-006). ${STATUS_NOTE}`,
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.changeStatus(id, 'reopen', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Put('jobs/:id/recruiter')
  @ApiOperation({
    summary: 'Change the recruiter of a job',
    description:
      'Needs Jobs → Edit. The new recruiter must be an active employee; the change is added to the job history.',
  })
  @ApiOkResponse({ type: JobDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  changeRecruiter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRecruiterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.changeRecruiter(id, dto, user);
  }
}
