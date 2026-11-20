import { Module } from '@nestjs/common';
import { EmployeesController } from './api/employees.controller.js';
import { EmploymentController } from './api/employment.controller.js';
import { IdentityBankController } from './api/identity-bank.controller.js';
import { ProfilesController } from './api/profiles.controller.js';
import { EmployeesService } from './application/employees.service.js';
import { EmploymentService } from './application/employment.service.js';
import { IdentityBankService } from './application/identity-bank.service.js';
import { ProfilesService } from './application/profiles.service.js';
import { EmployeesRepository } from './infrastructure/employees.repository.js';
import { EmploymentRepository } from './infrastructure/employment.repository.js';
import { IdentityBankRepository } from './infrastructure/identity-bank.repository.js';
import { ProfilesRepository } from './infrastructure/profiles.repository.js';

@Module({
  controllers: [EmployeesController, ProfilesController, EmploymentController, IdentityBankController],
  providers: [
    EmployeesService,
    EmployeesRepository,
    ProfilesService,
    ProfilesRepository,
    EmploymentService,
    EmploymentRepository,
    IdentityBankService,
    IdentityBankRepository,
  ],
  exports: [EmployeesService],
})
export class EmployeesModule {}
