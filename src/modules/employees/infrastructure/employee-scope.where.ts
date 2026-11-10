import type { EmployeeScope } from '../../../core/iam/data-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';

/* The data scope as a query filter (security rule 8: scope in the repository, never in memory). Same rule as
   `inEmployeeScope` in core/iam/data-scope.ts. */
export const employeeInScope = (scope: EmployeeScope): Prisma.EmployeeWhereInput => {
  switch (scope.kind) {
    case 'ALL':
      return {};
    case 'TEAM':
      return { OR: [{ id: scope.employeeId }, { reportingManagerId: scope.employeeId }] };
    case 'SELF':
      return { id: scope.employeeId };
  }
};
