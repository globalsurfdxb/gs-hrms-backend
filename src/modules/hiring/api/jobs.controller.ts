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
import { JobDetailResponse, JobListResponse, RecruiterPoolResponse } from './dto/job.response.js';
import { ListJobsQuery } from './dto/list-jobs.query.js';

const FEATURE = PERMISSIONS.hiring.jobs;
const STATUS_NOTE =
  'Full hiring access only (403 hiring.full_access_required otherwise). FILLED is set by the system when every ' +
  'position is filled — never through these routes.';
/** BR-HIR-022, shared by the read routes. */
const SCOPE =
  'With full hiring access (Jobs → View and Requisitions → View: Super Admin, HR, Talent Acquisition Manager) every ' +
  'job; otherwise only the caller’s own jobs — hiring manager or recruiter (BR-HIR-022); another job is 404.';

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
      `Needs Jobs → View. ${SCOPE} Newest first. Filters: status, location, recruiter, and awaitingRecruiter=true ` +
      'for jobs the Talent Acquisition Manager has yet to give a recruiter (BR-HIR-021).',
  })
  @ApiOkResponse({ type: JobListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListJobsQuery, @CurrentUser() user: AuthUser) {
    return this.jobs.list(query, user);
  }

  @RequirePermission(FEATURE)
  @Get('recruiters')
  @ApiOperation({
    summary: 'Talent Acquisition Manager and recruiter pool',
    description:
      'Needs Jobs → View. For the job form and the "Choose recruiter" drawer (BR-HIR-021): the Talent Acquisition ' +
      'Manager (the active employee with that designation, as the frontend finds them), whether a job you create ' +
      'now is handed to them (then leave the recruiter out), and the Talent Acquisition team (active Recruiters and ' +
      'the TA Manager, by designation) to choose from. With no TA Manager the pool is empty and any active employee ' +
      'may be the recruiter.',
  })
  @ApiOkResponse({ type: RecruiterPoolResponse })
  @ApiErrors(401, 403)
  recruiters(@CurrentUser() user: AuthUser) {
    return this.jobs.recruiters(user);
  }

  @RequirePermission(FEATURE)
  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get one job with its history',
    description: `Needs Jobs → View. ${SCOPE}`,
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
      'Needs Jobs → Add and full hiring access (Super Admin, HR, Talent Acquisition Manager by default; 403 ' +
      'hiring.full_access_required otherwise). Only from an APPROVED requisition that has no job yet (409 ' +
      'otherwise). Title, company, department, location, positions, budget and hiring manager come from the ' +
      'requisition. Interviewers must be active employees. publish=true opens it now; otherwise DRAFT (BR-HIR-005). ' +
      'Recruiter (BR-HIR-021): with a Talent Acquisition Manager in place, a job created by anyone but them or a ' +
      'Super Admin is handed to them with no recruiter — sending recruiterId then is 400 job.recruiter_chosen_by_ta; ' +
      'otherwise recruiterId is required (400 job.recruiter_required), from the Talent Acquisition team once there ' +
      'is one. See GET /hiring/recruiters.',
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
    summary: 'Choose or change the recruiter of a job',
    description:
      'Needs Jobs → Edit, and (BR-HIR-021) the caller must be a Super Admin, a Talent Acquisition Manager (by role ' +
      'or designation) or the TA Manager the job was handed to; on a job with no TA Manager, full hiring access ' +
      'also may (403 job.recruiter_not_allowed otherwise). With a TA Manager in place the recruiter must be on the ' +
      'Talent Acquisition team, otherwise any active employee (400 job.invalid_recruiter). Added to the job history. ' +
      'Another person’s job is 404 for own-jobs users.',
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
