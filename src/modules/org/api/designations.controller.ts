import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission, SignedIn } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { DesignationsService } from '../application/designations.service.js';
import { CreateDesignationDto } from './dto/create-designation.dto.js';
import { DesignationResponse } from './dto/designation.response.js';
import { ListDesignationsQuery } from './dto/list-designations.query.js';
import { UpdateDesignationDto } from './dto/update-designation.dto.js';

const FEATURE = PERMISSIONS.administration.structure;

/* Designations (job titles) within a department — frontend: Company Structure. */
@ApiTags('Organization · Designations')
@ApiCookieAuth()
@Controller('org/designations')
export class DesignationsController {
  constructor(private readonly designations: DesignationsService) {}

  @SignedIn()
  @Get()
  @ApiOperation({ summary: 'List designations', description: 'Any signed-in person. Filter by department.' })
  @ApiOkResponse({ type: [DesignationResponse] })
  @ApiErrors(400, 401)
  list(@Query() query: ListDesignationsQuery) {
    return this.designations.list(query);
  }

  @SignedIn()
  @Get(':id')
  @ApiOperation({ summary: 'Get one designation', description: 'Any signed-in person.' })
  @ApiOkResponse({ type: DesignationResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.designations.get(id);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Add a designation',
    description:
      'Needs Company Structure → Add (Super Admin, HR, Office Admin by default). Title unique within the ' +
      'department, ignoring case (409 designation.title_taken).',
  })
  @ApiCreatedResponse({ type: DesignationResponse })
  @ApiErrors(400, 401, 403, 409)
  create(@Body() dto: CreateDesignationDto, @CurrentUser() user: AuthUser) {
    return this.designations.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a designation',
    description: 'Needs Company Structure → Edit. Only the title changes; employees holding it keep it.',
  })
  @ApiOkResponse({ type: DesignationResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDesignationDto, @CurrentUser() user: AuthUser) {
    return this.designations.update(id, dto, user);
  }

  @RequirePermission(FEATURE, 'delete')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a designation',
    description:
      'Needs Company Structure → Delete (Super Admin by default). Refused with 409 designation.in_use while ' +
      'employees, requisitions or jobs use it (`details.usage` has the counts).',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 401, 403, 404, 409)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.designations.remove(id, user);
  }
}
