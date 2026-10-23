# Roadmap

| Phase                      | Scope                                                                                         | Exit criteria                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **0 · Foundation**         | Repo, CI, auth, permissions, org, audit, workflow engine, notifications, files, jobs          | Frontend can sign in (dev + SSO), manage org master data and roles against the API |
| **1 · Employee core**      | Employees, documents, requests, onboarding, offboarding, visa & expiry reminders              | Directory/profile/onboarding/offboarding screens run on the API                    |
| **2 · Hiring**             | Requisitions → offers, careers (public), templates, offer letters, Graph mail                 | Full hiring flow incl. public offer response and handoff to onboarding             |
| **3 · Leave & attendance** | Leave ledger and policies, holidays, shifts, punches, regularisation, OT, payroll lock/export | One leave model replaces both frontend implementations                             |
| **4 · Remaining**          | Expense, performance, learning, reports, dashboards, scheduled reports                        | All existing frontend screens on the API                                           |
| Later                      | Payroll, assets, renewals                                                                     | Designed when the frontend modules are specified                                   |

> **Priority change (2026-10-22):** the lead asked to build **Hiring** next, step by step, ahead of Phase 1.
> The step plan and the Phase 0 pieces each step needs are in [modules/hiring.md §11](modules/hiring.md#11-build-plan-step-by-step);
> hiring-specific questions are in its §10.

## Phase 0 backlog

Done in the scaffold:

- [x] NestJS 12 / Prisma 7 / Vitest project, Docker services, env validation
- [x] Entra SSO provider (PKCE, tenant pin), dev login, Postgres sessions, CSRF origin guard
- [x] Deny-by-default permission guard + route-guard CI test
- [x] Append-only audit log (DB trigger) with transactional writes
- [x] Field encryption + blind index helper, CSV injection helper
- [x] `org` reference module: companies API with unit + e2e tests
- [x] OpenAPI export, architecture rules, Claude Code skills, CI workflow

To do:

- [ ] `org`: locations (System Settings), departments, designations — incl. cascade/usage rules from `OrgContext`
- [ ] `iam`: roles & permissions API (list/create/rename roles, grant/revoke, custom features) + audit + session revoke on change
- [ ] `iam`: `ScopedRepository` base and data-scope resolution per role
- [ ] `core/workflow`: definitions, steps, approver resolvers, conditions, instances, decisions ([ADR-0004](adr/0004-workflow-engine.md))
- [ ] `core/jobs`: pg-boss setup, worker process flag, job conventions
- [ ] `core/notifications`: in-app notices (`toIds`/`toRoles`, read state), rules from DB, event listeners
- [ ] `core/files`: Blob upload (Azurite locally), user-delegation SAS, scan-status gate
- [ ] `core/mail`: SMTP (Mailpit) locally, Microsoft Graph in Azure, mail log
- [ ] `core/pdf`: Gotenberg client, HTML template rendering
- [ ] `/admin/audit` read API with filters and CSV export
- [ ] `infra/`: Bicep for staging, GitHub OIDC deployment
- [ ] Frontend: API client generation, `/api` proxy, sign-in switched to `/api/auth/*`

## Open decisions (owner: lead)

| #   | Question                                                                                                                                                                                                        | Blocks             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Entra app registration (Tenant ID, Client ID, secret/cert) — requested from M365 admin                                                                                                                          | SSO on staging     |
| 2   | Azure subscription(s), resource groups, who deploys                                                                                                                                                             | Staging            |
| 3   | Is `public/la` (Leave & Attendance) being rewritten in React? Which leave entitlements are correct (frontend says Annual 21 vs runtime 30, Sick 10 vs 90)?                                                      | Phase 3            |
| 4   | Biometric device model and integration (push vs pull)                                                                                                                                                           | Phase 3 attendance |
| 5   | Rules the frontend does not define yet: offer approval & expiry, interview feedback/scorecards, employee self-resignation (employee → TL → HR), onboarding final approval → Active, over-limit expense approval | Phases 1–4         |
| 6   | Data retention periods (candidates, ex-employees, audit)                                                                                                                                                        | Go-live            |
| 7   | Hiring access model: frontend uses roles (`hiringLevel`) while the permission catalogue's defaults differ (see hiring.md §10 Q3)                                                                                | Hiring step 0      |
