import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { RequisitionsService } from '../application/requisitions.service.js';
import { CreateRequisitionDto } from './dto/create-requisition.dto.js';
import { DecideRequisitionDto } from './dto/decide-requisition.dto.js';
import { ListRequisitionsQuery } from './dto/list-requisitions.query.js';
import { RequisitionListResponse, RequisitionResponse } from './dto/requisition.response.js';
import { UpdateRequisitionDto } from './dto/update-requisition.dto.js';

const FEATURE = PERMISSIONS.hiring.requisitions;
const APPROVALS = PERMISSIONS.hiring.requisitionApprovals;

const WHO_SEES =
  'HR and Super Admin see every requisition; others see those they raised or manage, those waiting on a step ' +
  'they decide, and those they already decided. Anything else is 404.';

@ApiTags('Hiring · Requisitions')
@ApiCookieAuth()
@Controller('hiring/requisitions')
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionsService) {}

  @RequirePermission(FEATURE)
  @Get()
  @ApiOperation({
    summary: 'List requisitions',
    description: `Needs Requisitions → View (Super Admin, HR, Office Admin, Team Lead by default). ${WHO_SEES} Newest first. Use waitingOnMe=true for the approval inbox.`,
  })
  @ApiOkResponse({ type: RequisitionListResponse })
  @ApiErrors(400, 401, 403)
  list(@Query() query: ListRequisitionsQuery, @CurrentUser() user: AuthUser) {
    return this.requisitions.list(query, user);
  }

  @RequirePermission(FEATURE)
  @Get(':id')
  @ApiOperation({ summary: 'Get one requisition', description: `Needs Requisitions → View. ${WHO_SEES}` })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requisitions.get(id, user);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Raise a requisition',
    description:
      'Needs Requisitions → Add (Super Admin, HR, Office Admin, Team Lead by default). Saved as DRAFT, or with ' +
      'submit=true sent straight into the approval chain Hiring Manager → HR → Management (the Hiring Manager step ' +
      'is approved automatically when you are the hiring manager). Currency follows the location. Rules BR-HIR-003.',
  })
  @ApiCreatedResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403)
  create(@Body() dto: CreateRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.requisitions.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a requisition',
    description:
      'Needs Requisitions → Edit, and you raised it, manage it, or are HR / Super Admin. Only while DRAFT or ' +
      'REJECTED (409 otherwise). Send only the fields that change; a rejected requisition stays REJECTED until resubmitted.',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.requisitions.update(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a requisition for approval',
    description:
      'Same access as edit. DRAFT or REJECTED → PENDING_APPROVAL with a fresh chain Hiring Manager → HR → ' +
      'Management; the Hiring Manager step is approved automatically when you are the hiring manager (BR-HIR-001).',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requisitions.submit(id, user);
  }

  @RequirePermission(APPROVALS, 'edit')
  @Post(':id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or reject the pending approval step',
    description:
      'Needs Requisition approvals → Edit, and the pending step must be yours: Hiring Manager step → that ' +
      'manager; HR step → HR or Office Admin; Management step → Super Admin (who may decide any step). Rejecting ' +
      'needs a note and rejects the requisition; approving the last step approves it (BR-HIR-002).',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideRequisitionDto, @CurrentUser() user: AuthUser) {
    return this.requisitions.decide(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/hold')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Put an approved requisition on hold',
    description: 'Needs Requisitions → Edit and recruiting access (HR, Super Admin). APPROVED → ON_HOLD (BR-HIR-004).',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  hold(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requisitions.changeStatus(id, 'hold', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/resume')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resume a requisition on hold',
    description: 'Needs Requisitions → Edit and recruiting access (HR, Super Admin). ON_HOLD → APPROVED (BR-HIR-004).',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requisitions.changeStatus(id, 'resume', user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Post(':id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Close a requisition',
    description:
      'Needs Requisitions → Edit and recruiting access (HR, Super Admin). APPROVED or ON_HOLD → CLOSED, final (BR-HIR-004).',
  })
  @ApiOkResponse({ type: RequisitionResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requisitions.changeStatus(id, 'close', user);
  }
}
