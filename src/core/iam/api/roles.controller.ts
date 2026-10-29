import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { ApiErrors } from '../../http/api-docs.js';
import { RequirePermission } from '../access.decorators.js';
import { PERMISSIONS } from '../permission-catalog.js';
import { RolesService } from '../roles.service.js';
import { AssignRoleDto, CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from './role.dto.js';
import { AssignRoleResponse, CatalogModuleResponse, RoleResponse, SetPermissionsResponse } from './role.response.js';

const FEATURE = PERMISSIONS.administration.roles;
const GUARDRAILS =
  'Nobody changes their own role or its permissions (403 role.own_role) or grants what they do not hold ' +
  '(403 role.grant_exceeds_own).';

/* Administration → Roles & Permissions. Every change is audited (module Access) and ends the sessions it affects. */
@ApiTags('Administration · Roles & permissions')
@ApiCookieAuth()
@Controller('iam')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermission(FEATURE)
  @Get('catalog')
  @ApiOperation({
    summary: 'Permission catalogue',
    description:
      'Needs Roles & Permissions → View. Module → category → feature, with the actions each feature allows. ' +
      'Builds the permission grid; the keys are `<feature>` (View) and `<feature>#add|edit|delete`.',
  })
  @ApiOkResponse({ type: [CatalogModuleResponse] })
  @ApiErrors(401, 403)
  catalog() {
    return CatalogModuleResponse.all();
  }

  @RequirePermission(FEATURE)
  @Get('roles')
  @ApiOperation({
    summary: 'List roles',
    description:
      'Needs Roles & Permissions → View. System roles first, each with its permission keys and member count.',
  })
  @ApiOkResponse({ type: [RoleResponse] })
  @ApiErrors(401, 403)
  list() {
    return this.roles.list();
  }

  @RequirePermission(FEATURE)
  @Get('roles/:id')
  @ApiOperation({ summary: 'Get one role', description: 'Needs Roles & Permissions → View.' })
  @ApiOkResponse({ type: RoleResponse })
  @ApiErrors(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.get(id);
  }

  @RequirePermission(FEATURE, 'add')
  @Post('roles')
  @ApiOperation({
    summary: 'Create a role',
    description:
      'Needs Roles & Permissions → Add (Super Admin, HR, Office Admin by default). A custom role, optionally with ' +
      `permissions. Name unique ignoring case (409 role.name_taken). ${GUARDRAILS}`,
  })
  @ApiCreatedResponse({ type: RoleResponse })
  @ApiErrors(400, 401, 403, 409)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch('roles/:id')
  @ApiOperation({
    summary: 'Rename a role or change its description',
    description: `Needs Roles & Permissions → Edit. System roles cannot be renamed (409 role.system). ${GUARDRAILS}`,
  })
  @ApiOkResponse({ type: RoleResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: AuthUser) {
    return this.roles.update(id, dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Put('roles/:id/permissions')
  @ApiOperation({
    summary: 'Set a role’s permissions',
    description:
      'Needs Roles & Permissions → Edit. Replaces the whole set; the response lists what was granted and revoked. ' +
      'The members’ sessions are ended so the change applies at once (they sign in again). The Super Admin role is ' +
      `fixed (409 role.super_admin_fixed). Unknown keys → 400 role.unknown_permission. ${GUARDRAILS}`,
  })
  @ApiOkResponse({ type: SetPermissionsResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roles.setPermissions(id, dto, user);
  }

  @RequirePermission(FEATURE, 'delete')
  @Delete('roles/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a role',
    description:
      'Needs Roles & Permissions → Delete (Super Admin by default). System roles cannot be deleted (409 role.system); ' +
      'a role someone still has cannot be deleted (409 role.in_use).',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 401, 403, 404, 409)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.roles.remove(id, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Put('employees/:employeeId/role')
  @ApiOperation({
    summary: 'Give an employee a role',
    description:
      'Needs Roles & Permissions → Edit. Not your own role (403 role.own_role); only between roles whose permissions ' +
      'you hold, for someone whose current role does not exceed yours (403 role.assign_exceeds_own). Ends their sessions.',
  })
  @ApiOkResponse({ type: AssignRoleResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  assign(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.roles.assign(employeeId, dto, user);
  }
}
