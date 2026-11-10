import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { EmployeesService } from '../application/employees.service.js';
import { EmployeeListResponse, EmployeeResponse } from './dto/employee.response.js';
import { ListEmployeesQuery } from './dto/list-employees.query.js';

const SCOPE =
  'Who appears depends on your permissions, not your role name: Directory → View (Organization or Operations) ' +
  'shows everyone (Super Admin, HR, Office Admin by default); Team → Directory shows you and your direct reports ' +
  '(Team Lead, Talent Acquisition Manager); anyone else sees only themselves.';

/* Employee directory — frontend: app/directory, app/team/directory. Signed in is enough: everyone sees at least
   their own record, and the data scope narrows the query. */
@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'List employees',
    description: `${SCOPE} The response's scope field says which applies. Sorted by name; filters combine.`,
  })
  @ApiOkResponse({ type: EmployeeListResponse })
  @ApiErrors(400, 401)
  list(@Query() query: ListEmployeesQuery, @CurrentUser() user: AuthUser) {
    return this.employees.list(query, user);
  }

  @SignedIn()
  @Get(':employeeCode')
  @ApiOperation({
    summary: 'Get one employee',
    description: `${SCOPE} Someone outside your scope is 404 employee.not_found, the same as a code that does not exist.`,
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: EmployeeResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('employeeCode') employeeCode: string, @CurrentUser() user: AuthUser) {
    return this.employees.get(employeeCode, user);
  }
}
