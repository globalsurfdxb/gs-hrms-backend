import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { CandidatesService } from '../application/candidates.service.js';
import { ApplicationDetailResponse } from './dto/application.response.js';
import { ApplyToJobDto, CandidateNoteDto, CandidateTagsDto } from './dto/candidate-actions.dto.js';
import { DuplicatesQuery, ListCandidatesQuery } from './dto/candidate-queries.js';
import {
  CandidateDetailResponse,
  CandidateListResponse,
  DuplicateCandidateResponse,
} from './dto/candidate.response.js';
import { CreateCandidateDto } from './dto/create-candidate.dto.js';

const FEATURE = PERMISSIONS.hiring.candidates;
const SALARY =
  'Salary appears only with full hiring access and for the hiring manager or recruiter of one of the candidate’s jobs.';
/** BR-HIR-022, shared by the routes on one candidate. */
const SCOPE =
  'With full hiring access (Jobs → View and Requisitions → View: Super Admin, HR, Talent Acquisition Manager) any ' +
  'candidate; otherwise only candidates on the caller’s own jobs (hiring manager or recruiter, BR-HIR-022), with ' +
  'only those applications; another candidate is 404.';

@ApiTags('Hiring · Candidates')
@ApiCookieAuth()
@Controller('hiring/candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @RequirePermission(FEATURE)
  @Get()
  @ApiOperation({
    summary: 'List candidates',
    description:
      `Needs Candidates → View. ${SCOPE} Newest first. Search ` +
      'q matches name, email, phone, company, title, city or an exact tag. No salary in the list.',
  })
  @ApiOkResponse({ type: CandidateListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListCandidatesQuery, @CurrentUser() user: AuthUser) {
    return this.candidates.list(query, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Get('duplicates')
  @ApiOperation({
    summary: 'Find candidates with the same email or phone',
    description:
      'Needs Candidates → Add. For the add form’s "already in the system" warning: same email, or the same last 9 ' +
      'phone digits (7+ digits). At most 5 matches (BR-HIR-007), and only candidates the caller may see (BR-HIR-022).',
  })
  @ApiOkResponse({ type: [DuplicateCandidateResponse] })
  @ApiErrors(400, 401, 403)
  duplicates(@Query() query: DuplicatesQuery, @CurrentUser() user: AuthUser) {
    return this.candidates.duplicates(query, user);
  }

  @RequirePermission(FEATURE)
  @Get(':id')
  @ApiOperation({
    summary: 'Get one candidate',
    description: `Needs Candidates → View. ${SCOPE} With notes and each application and its stage history. ${SALARY} Viewing salary is audited.`,
  })
  @ApiOkResponse({ type: CandidateDetailResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.candidates.get(id, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Add a candidate',
    description:
      'Needs Candidates → Add. With jobId (an OPEN job) the candidate is also added to that job at APPLIED and takes ' +
      'its location; otherwise locationId is required. Consent must be true. A candidate with the same email or ' +
      'phone returns 409 candidate.duplicate with details.candidateId — add that person to the job instead ' +
      '(BR-HIR-007, BR-HIR-008); if the caller may not see that person, the 409 has no details. Without full hiring ' +
      'access jobId is required (400 candidate.job_required) and must be one of the caller’s own jobs (404 ' +
      'otherwise). Sending salary needs salary access for that job (403 otherwise).',
  })
  @ApiCreatedResponse({ type: CandidateDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  create(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthUser) {
    return this.candidates.create(dto, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Post(':id/applications')
  @ApiOperation({
    summary: 'Add a candidate to a job',
    description:
      'Needs Candidates → Add. Only an OPEN job, once per job; starts at APPLIED (BR-HIR-008). Without full hiring ' +
      'access both the candidate and the job must be on the caller’s own jobs (404 otherwise). Returns the application.',
  })
  @ApiCreatedResponse({ type: ApplicationDetailResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  apply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyToJobDto, @CurrentUser() user: AuthUser) {
    return this.candidates.apply(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Put(':id/tags')
  @ApiOperation({
    summary: 'Replace a candidate’s tags',
    description: `Needs Candidates → Edit. ${SCOPE} The whole list, at most 20; trimmed and de-duplicated.`,
  })
  @ApiOkResponse({ type: CandidateDetailResponse })
  @ApiErrors(400, 401, 403, 404)
  setTags(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CandidateTagsDto, @CurrentUser() user: AuthUser) {
    return this.candidates.setTags(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/notes')
  @ApiOperation({
    summary: 'Add a note to a candidate',
    description: `Needs Candidates → Edit. ${SCOPE} Notes cannot be changed or deleted afterwards.`,
  })
  @ApiCreatedResponse({ type: CandidateDetailResponse })
  @ApiErrors(400, 401, 403, 404)
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CandidateNoteDto, @CurrentUser() user: AuthUser) {
    return this.candidates.addNote(id, dto, user);
  }
}
