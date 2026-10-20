import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { CurrentUser } from '../../../core/auth/current-user.decorator.js';
import { ApiErrors } from '../../../core/http/api-docs.js';
import { RequirePermission, SignedIn } from '../../../core/iam/access.decorators.js';
import { PERMISSIONS } from '../../../core/iam/permission-catalog.js';
import { CompaniesService } from '../application/companies.service.js';
import { CompanyResponse } from './dto/company.response.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';

const FEATURE = PERMISSIONS.administration.companies;

/* REFERENCE CONTROLLER — copy this shape for new endpoints (skill: new-endpoint).
   Thin: access decorator, Swagger docs, validation via DTOs, delegate to the service, typed response.
   Every route documents: what it does (@ApiOperation), who may call it (in the description), the success
   response and the errors it can return (@ApiErrors). */
@ApiTags('Organization · Companies')
@ApiCookieAuth()
@Controller('org/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  /** Master data used by forms everywhere (onboarding, requisitions), so any signed-in person may read it. */
  @SignedIn()
  @Get()
  @ApiOperation({ summary: 'List companies', description: 'Any signed-in person. Used to fill company pickers.' })
  @ApiOkResponse({ type: [CompanyResponse] })
  @ApiErrors(401)
  list() {
    return this.companies.list();
  }

  @SignedIn()
  @Get(':id')
  @ApiOperation({ summary: 'Get one company', description: 'Any signed-in person.' })
  @ApiOkResponse({ type: CompanyResponse })
  @ApiErrors(400, 401, 404)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.get(id);
  }

  @RequirePermission(FEATURE, 'add')
  @Post()
  @ApiOperation({
    summary: 'Create a company',
    description: 'Needs Companies → Add (Super Admin, HR, Office Admin by default). Short code is stored upper-case.',
  })
  @ApiCreatedResponse({ type: CompanyResponse })
  @ApiErrors(400, 401, 403, 409)
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthUser) {
    return this.companies.create(dto, user);
  }

  @RequirePermission(FEATURE, 'edit')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a company',
    description: 'Needs Companies → Edit. Send only the fields that change. Set status INACTIVE to deactivate.',
  })
  @ApiOkResponse({ type: CompanyResponse })
  @ApiErrors(400, 401, 403, 404, 409)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto, @CurrentUser() user: AuthUser) {
    return this.companies.update(id, dto, user);
  }
}
