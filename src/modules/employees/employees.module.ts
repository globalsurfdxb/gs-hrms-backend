import { Module } from '@nestjs/common';
import { EmployeesController } from './api/employees.controller.js';
import { EmployeesService } from './application/employees.service.js';
import { EmployeesRepository } from './infrastructure/employees.repository.js';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesRepository],
  exports: [EmployeesService],
})
export class EmployeesModule {}
