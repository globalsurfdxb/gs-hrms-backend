# Employees module

Spec: docs/modules/employees.md — read it first. Frontend sources: `components/directory/DirectoryView.tsx`,
`app/directory/**`, `app/team/directory`, `lib/guard.ts` (who may open a record), `lib/employeeStore.ts`.

## Rules specific to this module

- Record-level access: every query takes the caller's `EmployeeScope` (`core/iam/data-scope.ts`) and filters in
  `where` via `infrastructure/employee-scope.where.ts` — ALL (Directory → View), TEAM (Team → Directory: self +
  direct reports), SELF. Out of scope is a 404, never a 403.
- Business rule ids: BR-EMP-001 … (keep code comments and tests in sync).

## Do not

- Return profile, identity, bank or salary fields from the directory response; they get their own response
  classes and access levels.
- Decide access by role name — always by permission, so custom roles follow their grants.
