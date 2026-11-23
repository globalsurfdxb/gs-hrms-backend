import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { SalaryService } from '../application/salary.service.js';
import { SalaryResponse } from './dto/salary.response.js';
import { UpdateSalaryDto } from './dto/update-salary.dto.js';

/* Salary structure — frontend: app/directory/[code] "Salary" tab. Access is checked in SalaryService by permission
   (Salary) and data scope, because anyone may read their own salary; so the routes are @SignedIn. */
@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees/:employeeCode/salary')
export class SalaryController {
  constructor(private readonly salary: SalaryService) {}

  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'Get an employee’s salary structure',
    description:
      'Needs Employee Management → Identity, bank & salary → Salary → View (HR, Super Admin by default) and the ' +
      'person in your directory scope. Anyone may read their own. Otherwise 404 employee.not_found. Amounts are ' +
      'strings with 2 decimals in the location’s currency (AED or INR); totals and net pay are calculated. Viewing ' +
      'someone else’s salary writes an audit row (Salary · employee.salary_viewed, no amounts).',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: SalaryResponse })
  @ApiErrors(401, 404)
  get(@Param('employeeCode') employeeCode: string, @CurrentUser() user: AuthUser) {
    return this.salary.get(employeeCode, user);
  }

  @SignedIn()
  @Put()
  @ApiOperation({
    summary: 'Replace an employee’s salary structure',
    description:
      'Needs Salary → Edit (HR, Super Admin by default), otherwise 403 employee.salary_edit_not_allowed, and the ' +
      'person in your Directory → Edit scope (404 otherwise). Your own salary cannot be changed (403 ' +
      'employee.salary_own_edit_not_allowed). Send every earning and deduction: the list replaces what is saved. ' +
      'Names are required and unique per list; at most 20 lines each; deductions may not exceed earnings. Writes ' +
      'one audit row (Salary · employee.salary_updated) with the component names and whether amounts changed, ' +
      'never the amounts. No change, no audit row.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: SalaryResponse })
  @ApiErrors(400, 401, 403, 404)
  replace(@Param('employeeCode') employeeCode: string, @Body() dto: UpdateSalaryDto, @CurrentUser() user: AuthUser) {
    return this.salary.replace(employeeCode, dto, user);
  }
}
