import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { ProfilesService } from '../application/profiles.service.js';
import { ProfileResponse } from './dto/profile.response.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

/* Employee profile — frontend: app/directory/[code] (Overview, Personal, Emergency, Experience & Education, Family
   tabs) and app/directory/[code]/edit. Identity, bank, salary and documents are separate, with stricter access. */
@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees/:employeeCode/profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'Get an employee’s profile',
    description:
      'Personal details, emergency contacts, work experience, education and family. Anyone who can see the person ' +
      'in the directory (data scope: everyone, self + direct reports, or self) — otherwise 404 employee.not_found. ' +
      '`canEdit` says whether you may save changes.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('employeeCode') employeeCode: string, @CurrentUser() user: AuthUser) {
    return this.profiles.get(employeeCode, user);
  }

  @SignedIn()
  @Patch()
  @ApiOperation({
    summary: 'Update an employee’s profile',
    description:
      'Needs Directory → Edit in Organization or Operations (Super Admin, HR, Office Admin by default) — otherwise ' +
      '403 employee.edit_not_allowed. Fields left out stay as they are; null or "" clears one. A list that is sent ' +
      'replaces the whole list. Emergency contact groups must match the work location (BR-EMP-010). One audit row ' +
      '(Employee · employee.profile_updated) lists what changed; a save that changes nothing writes nothing.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiErrors(400, 401, 403, 404)
  update(@Param('employeeCode') employeeCode: string, @Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser) {
    return this.profiles.update(employeeCode, dto, user);
  }
}
