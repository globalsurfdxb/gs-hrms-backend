import { Module } from '@nestjs/common';
import { CompaniesController } from './api/companies.controller.js';
import { CompaniesService } from './application/companies.service.js';
import { CompaniesRepository } from './infrastructure/companies.repository.js';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesRepository],
  exports: [CompaniesService],
})
export class OrgModule {}
