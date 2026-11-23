import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { InterviewsService } from '../application/interviews.service.js';
import {
  InterviewClashesQuery,
  ListInterviewsQuery,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
} from './dto/interview.dto.js';
import { InterviewClashesResponse, InterviewListResponse, InterviewResponse } from './dto/interview.response.js';

const FEATURE = PERMISSIONS.hiring.interviews;
/** BR-HIR-022, shared by every interview route. */
const SCOPE =
  'With full hiring access (Jobs → View and Requisitions → View: Super Admin, HR, Talent Acquisition Manager) any ' +
  'interview; otherwise only those on the caller’s own jobs (hiring manager or recruiter, BR-HIR-022) — anything ' +
  'else is 404.';
const TIMES = 'Times are typed in the job location’s local time (Dubai or Kochi) and must not be in the past.';

@ApiTags('Hiring · Interviews')
@ApiCookieAuth()
@Controller('hiring/interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @RequirePermission(FEATURE)
  @Get()
  @ApiOperation({
    summary: 'List interviews',
    description:
      `Needs Interviews → View. ${SCOPE} when=upcoming (default: scheduled and not yet over, soonest first), ` +
      'past (completed, cancelled or over, latest first) or all; filter by location, job or application.',
  })
  @ApiOkResponse({ type: InterviewListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListInterviewsQuery, @CurrentUser() user: AuthUser) {
    return this.interviews.list(query, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Get('clashes')
  @ApiOperation({
    summary: 'Check the panel for clashes',
    description:
      `Needs Interviews → Add. ${SCOPE} Which of the given panelists already have a scheduled interview overlapping ` +
      'this time (BR-HIR-010) — names only, never the other interview. A warning for the form; scheduling is not ' +
      'refused. When rescheduling, pass excludeId.',
  })
  @ApiOkResponse({ type: InterviewClashesResponse })
  @ApiErrors(400, 401, 403, 404)
  clashes(@Query() query: InterviewClashesQuery, @CurrentUser() user: AuthUser) {
    return this.interviews.clashes(query, user);
  }

  @RequirePermission(FEATURE)
  @Get(':id')
  @ApiOperation({ summary: 'Get one interview', description: `Needs Interviews → View. ${SCOPE}` })
  @ApiOkResponse({ type: InterviewResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.interviews.get(id, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Schedule an interview',
    description:
      `Needs Interviews → Add. ${SCOPE} BR-HIR-010: only for a candidate still in the pipeline on a job that is not ` +
      `closed or filled (409); at least one active panel member; link https only. ${TIMES} A screening call, ` +
      'technical or HR round moves the candidate forward to that stage (never back), with a stage-history line.',
  })
  @ApiCreatedResponse({ type: InterviewResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  schedule(@Body() dto: ScheduleInterviewDto, @CurrentUser() user: AuthUser) {
    return this.interviews.schedule(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Put(':id')
  @ApiOperation({
    summary: 'Reschedule an interview',
    description:
      `Needs Interviews → Edit. ${SCOPE} A new date and time, and optionally duration, mode, panel and link. The ` +
      `round stays. Only a SCHEDULED interview of a candidate still in the pipeline (409). ${TIMES} Counts the move.`,
  })
  @ApiOkResponse({ type: InterviewResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.interviews.reschedule(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark an interview completed',
    description: `Needs Interviews → Edit. ${SCOPE} Only a SCHEDULED interview (409 otherwise).`,
  })
  @ApiOkResponse({ type: InterviewResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.interviews.complete(id, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel an interview',
    description: `Needs Interviews → Edit. ${SCOPE} Only a SCHEDULED interview (409 otherwise).`,
  })
  @ApiOkResponse({ type: InterviewResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.interviews.cancel(id, user);
  }
}
