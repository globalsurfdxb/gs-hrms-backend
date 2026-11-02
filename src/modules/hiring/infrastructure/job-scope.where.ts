import type { Prisma } from '../../../generated/prisma/client.js';
import type { HiringScope } from '../domain/job-scope.js';

/* BR-HIR-022 as a query filter (security rule 8: scope in the repository, never in memory). Same rule as
   `isOwnJob` in domain/job-scope.ts: the job's recruiter or its requisition's hiring manager. */
export const jobInScope = (scope: HiringScope): Prisma.JobWhereInput =>
  scope.all ? {} : { OR: [{ recruiterId: scope.employeeId }, { requisition: { hiringManagerId: scope.employeeId } }] };

/** Applications on jobs in scope. */
export const applicationInScope = (scope: HiringScope): Prisma.ApplicationWhereInput =>
  scope.all ? {} : { job: jobInScope(scope) };

/** Candidates with at least one application on a job in scope. */
export const candidateInScope = (scope: HiringScope): Prisma.CandidateWhereInput =>
  scope.all ? {} : { applications: { some: { job: jobInScope(scope) } } };
