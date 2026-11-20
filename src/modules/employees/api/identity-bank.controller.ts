import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { SignedIn } from '../../../core/iam/access.decorators.js';
import { IdentityBankService } from '../application/identity-bank.service.js';
import { IdentityBankResponse, RevealedNumberResponse } from './dto/identity-bank.response.js';
import { RevealNumberDto, UpdateIdentityBankDto } from './dto/update-identity-bank.dto.js';

/* Identity (passport, Emirates ID / visa / labour card, Aadhaar, PAN), PF and bank details — frontend:
   app/directory/[code] identity and "Bank & PF" tabs. Access is checked in IdentityBankService by permission
   (Identity & bank details, Reveal full numbers) and data scope, so the routes are @SignedIn. */
@ApiTags('Employees')
@ApiCookieAuth()
@Controller('employees/:employeeCode/identity-bank')
export class IdentityBankController {
  constructor(private readonly identityBank: IdentityBankService) {}

  @SignedIn()
  @Get()
  @ApiOperation({
    summary: 'Get an employee’s identity and bank details (masked)',
    description:
      'Needs Employee Management → Identity & bank → Identity & bank details → View (HR, Super Admin by default) ' +
      'and the person in your directory scope. Anyone may read their own. Otherwise 404 employee.not_found. ' +
      'Passport, Emirates ID, Aadhaar, PAN, UAN and account numbers are masked to the last 4 characters. ' +
      '`template` says which fields apply (BR-EMP-001); `canEdit` and `canReveal` say what you may do.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: IdentityBankResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('employeeCode') employeeCode: string, @CurrentUser() user: AuthUser) {
    return this.identityBank.get(employeeCode, user);
  }

  @SignedIn()
  @Patch()
  @ApiOperation({
    summary: 'Update an employee’s identity and bank details',
    description:
      'Needs Identity & bank details → Edit (HR, Super Admin by default), otherwise 403 ' +
      'employee.identity_bank_edit_not_allowed, and the person in your Directory → Edit scope (404 otherwise). ' +
      'Fields left out stay; "" or null clears one. Numbers may contain spaces and are stored encrypted. Fields of ' +
      'the other country are refused (BR-EMP-001); formats and PF rules: BR-EMP-008/009. Writes one audit row per ' +
      'area that changed — Employee · employee.identity_updated and Bank · employee.bank_updated — with numbers ' +
      'masked. Returns the details masked.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: IdentityBankResponse })
  @ApiErrors(400, 401, 403, 404)
  update(
    @Param('employeeCode') employeeCode: string,
    @Body() dto: UpdateIdentityBankDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.identityBank.update(employeeCode, dto, user);
  }

  @SignedIn()
  @Post('reveal')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reveal one full identity or bank number',
    description:
      'Needs Employee Management → Identity & bank → Reveal full numbers (HR, Super Admin by default), otherwise ' +
      '403 employee.reveal_not_allowed, and a record you may read (404 employee.not_found). Returns one number; ' +
      '404 employee.number_not_on_file when it is empty. Every reveal writes an audit row ' +
      '(Employee · employee.number_revealed) naming the field, never the value. Show it briefly and do not store it.',
  })
  @ApiParam({ name: 'employeeCode', example: 'GS-087' })
  @ApiOkResponse({ type: RevealedNumberResponse })
  @ApiErrors(400, 401, 403, 404)
  reveal(@Param('employeeCode') employeeCode: string, @Body() dto: RevealNumberDto, @CurrentUser() user: AuthUser) {
    return this.identityBank.reveal(employeeCode, dto.field, user);
  }
}
