import { Module } from '@nestjs/common';
import { EmployeesController } from './api/employees.controller.js';
import { ProfilesController } from './api/profiles.controller.js';
import { EmployeesService } from './application/employees.service.js';
import { ProfilesService } from './application/profiles.service.js';
import { EmployeesRepository } from './infrastructure/employees.repository.js';
import { ProfilesRepository } from './infrastructure/profiles.repository.js';

@Module({
  controllers: [EmployeesController, ProfilesController],
  providers: [EmployeesService, EmployeesRepository, ProfilesService, ProfilesRepository],
  exports: [EmployeesService],
})
export class EmployeesModule {}
