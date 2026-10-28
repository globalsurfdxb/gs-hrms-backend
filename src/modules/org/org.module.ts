import { Module } from '@nestjs/common';
import { CompaniesController } from './api/companies.controller.js';
import { DepartmentsController } from './api/departments.controller.js';
import { DesignationsController } from './api/designations.controller.js';
import { LocationsController } from './api/locations.controller.js';
import { CompaniesService } from './application/companies.service.js';
import { DepartmentsService } from './application/departments.service.js';
import { DesignationsService } from './application/designations.service.js';
import { LocationsService } from './application/locations.service.js';
import { CompaniesRepository } from './infrastructure/companies.repository.js';
import { DepartmentsRepository } from './infrastructure/departments.repository.js';
import { DesignationsRepository } from './infrastructure/designations.repository.js';
import { LocationsRepository } from './infrastructure/locations.repository.js';

@Module({
  controllers: [CompaniesController, LocationsController, DepartmentsController, DesignationsController],
  providers: [
    CompaniesService,
    CompaniesRepository,
    LocationsService,
    LocationsRepository,
    DepartmentsService,
    DepartmentsRepository,
    DesignationsService,
    DesignationsRepository,
  ],
  exports: [CompaniesService, LocationsService, DepartmentsService, DesignationsService],
})
export class OrgModule {}
