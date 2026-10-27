import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
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
import { LocationsService } from '../application/locations.service.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LocationResponse } from './dto/location.response.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';

const FEATURE = PERMISSIONS.administration.settings;

/* Locations (frontend: System Settings). Ids are readable keys ("Dubai"), not UUIDs. */
@ApiTags('Organization · Locations')
@ApiCookieAuth()
@Controller('org/locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /** Master data used by forms and the top-bar location selector, so any signed-in person may read it. */
  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'List locations',
    description: 'Any signed-in person. Built-in locations first, then by name.',
  })
  @ApiOkResponse({ type: [LocationResponse] })
  @ApiErrors(401)
  list() {
    return this.locations.list();
  }

  @SignedIn()
  @Get(':id')
  @ApiOperation({ summary: 'Get one location', description: 'Any signed-in person. The id is readable, e.g. Dubai.' })
  @ApiOkResponse({ type: LocationResponse })
  @ApiErrors(401, 404)
  get(@Param('id') id: string) {
    return this.locations.get(id);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Add a location',
    description:
      'Needs System Settings → Add (Super Admin, HR, Office Admin by default). The server makes the id from the city ' +
      '(or the name) and returns it. Names are unique ignoring case (409 location.name_taken).',
  })
  @ApiCreatedResponse({ type: LocationResponse })
  @ApiErrors(400, 401, 403, 409)
  create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthUser) {
    return this.locations.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a location',
    description:
      'Needs System Settings → Edit. Send only the fields that change; `seating` replaces the whole list. ' +
      'The form rules of a built-in location cannot change (409 location.system_template).',
  })
  @ApiOkResponse({ type: LocationResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto, @CurrentUser() user: AuthUser) {
    return this.locations.update(id, dto, user);
  }

  @RequirePermission(FEATURE, 'delete')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a location',
    description:
      'Needs System Settings → Delete (Super Admin by default). Refused with 409 for a built-in location ' +
      '(location.system) or one still in use (location.in_use; `details.usage` counts what references it).',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(401, 403, 404, 409)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.locations.remove(id, user);
  }
}
