import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { EmploymentService } from '../application/employment.service.js';
import { EmployeeResponse } from './dto/employee.response.js';
import { UpdateEmploymentDto } from './dto/update-employment.dto.js';

/* Employment record — frontend: app/directory/[code]/edit (Personal → name, Employment tab). */
@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees/:employeeCode/employment')
export class EmploymentController {
  constructor(private readonly employment: EmploymentService) {}

  @SignedIn()
  @Patch()
  @ApiOperation({
    summary: 'Update an employee’s employment details',
    description:
      'Name, work location, organization, department, designation, reporting manager, employment type and joining ' +
      'date. Needs Directory → Edit in Organization or Operations (Super Admin, HR, Office Admin by default) — ' +
      'otherwise 403 employee.edit_not_allowed; someone outside your scope is 404. Fields left out stay as they are; ' +
      'null clears department, designation or manager. Rules: the organization operates in the location, the ' +
      'department belongs to the organization and the location, the designation to the department (BR-EMP-002); the ' +
      'manager is active and not in the employee’s own reporting line (BR-EMP-003). Email, employee code and status ' +
      'cannot be changed here (BR-EMP-004). A move between UAE and India switches emergency contact groups and clears ' +
      'a seating location the new office does not have (BR-EMP-001). One audit row (Employee · ' +
      'employee.employment_updated) lists what changed; a save that changes nothing writes nothing. Returns the ' +
      'directory record.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: EmployeeResponse })
  @ApiErrors(400, 401, 403, 404)
  update(@Param('employeeCode') employeeCode: string, @Body() dto: UpdateEmploymentDto, @CurrentUser() user: AuthUser) {
    return this.employment.update(employeeCode, dto, user);
  }
}
