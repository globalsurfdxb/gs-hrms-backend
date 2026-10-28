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
import { DepartmentsService } from '../application/departments.service.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { DepartmentResponse } from './dto/department.response.js';
import { ListDepartmentsQuery } from './dto/list-departments.query.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';

const FEATURE = PERMISSIONS.administration.structure;

/* Departments (frontend: Company Structure). Each department belongs to one company and lists its designations. */
@ApiTags('Organization · Departments')
@ApiCookieAuth()
@Controller('org/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  /** Master data used by forms everywhere (onboarding, requisitions), so any signed-in person may read it. */
  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'List departments',
    description: 'Any signed-in person. Filter by company and/or location. Each includes its designations.',
  })
  @ApiOkResponse({ type: [DepartmentResponse] })
  @ApiErrors(400, 401)
  list(@Query() query: ListDepartmentsQuery) {
    return this.departments.list(query);
  }

  @SignedIn()
  @Get(':id')
  @ApiOperation({ summary: 'Get one department', description: 'Any signed-in person.' })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.departments.get(id);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Add a department',
    description:
      'Needs Company Structure → Add (Super Admin, HR, Office Admin by default). Name unique within the company ' +
      '(409 department.name_taken). At least one location, and only the company location unless the company ' +
      'operates in every location. The head must be a current employee of the same company.',
  })
  @ApiCreatedResponse({ type: DepartmentResponse })
  @ApiErrors(400, 401, 403, 409)
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthUser) {
    return this.departments.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a department',
    description:
      'Needs Company Structure → Edit. Send only the fields that change; `locationIds` replaces the list and ' +
      '`headEmployeeId: null` removes the head. The company cannot change. A location where current employees of ' +
      'the department work cannot be removed (409 department.location_in_use).',
  })
  @ApiOkResponse({ type: DepartmentResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: AuthUser) {
    return this.departments.update(id, dto, user);
  }

  @RequirePermission(FEATURE, 'delete')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a department',
    description:
      'Needs Company Structure → Delete (Super Admin by default). Also deletes its designations. Refused with 409 ' +
      'department.in_use while employees, requisitions or jobs use the department or one of its designations ' +
      '(`details.usage` has the counts).',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 401, 403, 404, 409)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.departments.remove(id, user);
  }
}
