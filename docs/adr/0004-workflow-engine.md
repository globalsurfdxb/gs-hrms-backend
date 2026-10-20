# 0004. One approval workflow engine for all modules

- Status: Accepted
- Date: 2026-10-19

## Context

The frontend hard-codes approvals differently in each module (requisition step labels, request routing by type,
leave approver chain, expense manager routing); the Workflow Settings screen only displays labels.

## Decision

`core/workflow` provides: workflow definitions → ordered steps → approver resolver
(`ROLE`, `REPORTING_MANAGER`, `MANAGER_OF_MANAGER`, `RECORD_FIELD`, `SPECIFIC_EMPLOYEE`) → optional conditions
(e.g. amount above category limit) → instances with per-step decisions (approve/reject + note).
Rules: never the requester, never someone who reports to the requester, rejection ends the instance.
Used by requisitions, onboarding, offboarding, employee requests, leave, regularisation, overtime, encashment, expense.

## Consequences

- Admins can change approval chains without code.
- Modules must not implement their own approval logic.
