import { Module } from '@nestjs/common';
import { ApplicationsController } from './api/applications.controller.js';
import { CandidatesController } from './api/candidates.controller.js';
import { JobsController } from './api/jobs.controller.js';
import { RequisitionsController } from './api/requisitions.controller.js';
import { ApplicationsService } from './application/applications.service.js';
import { CandidatesService } from './application/candidates.service.js';
import { JobsService } from './application/jobs.service.js';
import { RequisitionsService } from './application/requisitions.service.js';
import { ApplicationsRepository } from './infrastructure/applications.repository.js';
import { CandidatesRepository } from './infrastructure/candidates.repository.js';
import { JobsRepository } from './infrastructure/jobs.repository.js';
import { RequisitionsRepository } from './infrastructure/requisitions.repository.js';

// Built step by step — see docs/modules/hiring.md §11. Step 1: requisitions. Step 2: jobs. Step 3: candidates and pipeline.
@Module({
  controllers: [RequisitionsController, JobsController, CandidatesController, ApplicationsController],
  providers: [
    RequisitionsService,
    RequisitionsRepository,
    JobsService,
    JobsRepository,
    CandidatesService,
    CandidatesRepository,
    ApplicationsService,
    ApplicationsRepository,
  ],
})
export class HiringModule {}
