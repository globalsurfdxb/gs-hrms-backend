import { Module } from '@nestjs/common';
import { JobsController } from './api/jobs.controller.js';
import { RequisitionsController } from './api/requisitions.controller.js';
import { JobsService } from './application/jobs.service.js';
import { RequisitionsService } from './application/requisitions.service.js';
import { JobsRepository } from './infrastructure/jobs.repository.js';
import { RequisitionsRepository } from './infrastructure/requisitions.repository.js';

// Built step by step — see docs/modules/hiring.md §11. Step 1: requisitions. Step 2: jobs.
@Module({
  controllers: [RequisitionsController, JobsController],
  providers: [RequisitionsService, RequisitionsRepository, JobsService, JobsRepository],
})
export class HiringModule {}
