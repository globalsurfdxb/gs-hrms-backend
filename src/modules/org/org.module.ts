import { Module } from '@nestjs/common';
import { CompaniesController } from './api/companies.controller.js';
import { LocationsController } from './api/locations.controller.js';
import { CompaniesService } from './application/companies.service.js';
import { LocationsService } from './application/locations.service.js';
import { CompaniesRepository } from './infrastructure/companies.repository.js';
import { LocationsRepository } from './infrastructure/locations.repository.js';

@Module({
  controllers: [CompaniesController, LocationsController],
  providers: [CompaniesService, CompaniesRepository, LocationsService, LocationsRepository],
  exports: [CompaniesService, LocationsService],
})
export class OrgModule {}
