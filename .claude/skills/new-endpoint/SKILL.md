---
name: new-endpoint
description: Add one API endpoint end to end — permission, DTO, response class, controller, service, repository, domain rule, audit, unit + e2e tests, OpenAPI export and module doc row. Use for any new or changed route.
---

# New endpoint

Reference: `src/modules/org/api/companies.controller.ts` and the files it calls. Copy that shape.

## Decide first (write the answers in your reply before coding)

1. Path + method (docs/conventions.md#api). Self-service → `/api/me/...`.
2. Access: `@Public` (justify), `@SignedIn`, or `@RequirePermission(PERMISSIONS.x.y, action)`.
3. Record-level rule (team lead → direct reports, not own request, …) and the data scope for the query.
4. Which business rules (BR ids) apply; which state transition, if any.
5. What is audited (module + action) and whether any field is sensitive.

## Build, in this order

1. **Permission** — feature in `src/core/iam/permission-catalog.ts` (frontend id) if new.
2. **Domain** — pure rule/transition in `domain/` + unit test `*.spec.ts` named after the BR id.
3. **DTO** — `api/dto/<verb>-<entity>.dto.ts`: class-validator on every field, `@ApiProperty` with example.
   No privilege fields (role, status, employeeId of caller, salary) unless that is the endpoint's purpose.
4. **Response** — `api/dto/<entity>.response.ts` with static `from()`; list every field; mask sensitive ones.
5. **Repository** — query with scope filter in `where`; writes in `$transaction` with `audit.record(entry, tx)`.
6. **Service** — orchestrate; throw `AppError` codes `<entity>.<problem>`; check record-level access
   (return `notFound` when the caller must not learn the record exists).
7. **Controller** — thin; `ParseUUIDPipe` for ids; `@CurrentUser()`. **Swagger on every route:**
   ```ts
   @ApiOperation({ summary: 'Approve a leave request', description: 'Needs … Who may call it, what changes.' })
   @ApiOkResponse({ type: LeaveRequestResponse })          // or @ApiCreatedResponse / @ApiNoContentResponse
   @ApiErrors(400, 401, 403, 404, 409)                     // every error status this route can return
   ```
   Write the description for a frontend developer: who may call it, what it changes, notable rules.
8. **E2E test** — `test/<module>/<entity>.e2e-spec.ts`: happy path + 403/404 for each role that must not
   have access + validation failure. Use `signInAs` and send `Origin` on writes.
9. **Bruno request** — `bruno/<module>/<Verb noun>.bru` (copy `bruno/org-companies/`): `Origin: {{origin}}`
   header on writes, a `docs` block (who may call it) and a `tests` block. Save created ids with
   `bru.setEnvVar` for follow-up requests. Never commit real data or ids from a shared environment.
10. `npm run openapi:export` and include `docs/api/openapi.json` in the change.
11. Add the endpoint row (and new BR ids) to `docs/modules/<spec>.md`. If a business flow changed, update
    `flow/src/<module>.html` and run `npm run flow:pdf`.
12. `npm run check` must pass (it includes the Swagger completeness test). Then run the `security-check`
    skill if the endpoint touches personal data, files, exports, money, auth or is public.
