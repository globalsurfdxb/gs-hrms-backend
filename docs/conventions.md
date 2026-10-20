# Conventions

When this file and the reference module (`src/modules/org`) disagree, fix one of them in the same PR.

## Naming

| Thing            | Convention                       | Example                                                                |
| ---------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Files            | kebab-case + role suffix         | `companies.controller.ts`, `create-company.dto.ts`, `company.rules.ts` |
| Classes          | PascalCase + role                | `CompaniesService`, `CompaniesRepository`, `CompanyResponse`           |
| Request DTOs     | `<Verb><Entity>Dto`              | `CreateCompanyDto`, `DecideLeaveDto`                                   |
| Response classes | `<Entity>Response`               | `CompanyResponse`                                                      |
| Error codes      | `<entity>.<problem>` snake_case  | `company.short_code_taken`                                             |
| Audit actions    | `<entity>.<past-tense verb>`     | `company.created`, `leave.approved`                                    |
| Events           | `<module>.<entity>.<past-tense>` | `hiring.offer.accepted`                                                |
| Business rules   | `BR-<MOD>-<NNN>`                 | `BR-ORG-001` — referenced in code comments, tests and docs             |

ESM: every relative import ends in `.js`.

## API

- Prefix `/api`. Resource paths are plural nouns grouped by module: `/api/org/companies`, `/api/leave/requests`.
- Actions that are not CRUD are sub-resources with POST: `POST /api/leave/requests/:id/approve`.
- Self-service lives under `/api/me/...` (`@SignedIn`, scoped to the caller).
- IDs are UUIDs (`ParseUUIDPipe`), except readable keys the frontend uses (`Location.id`, `employeeCode`).
- Lists: `?page=1&pageSize=50` (max 100) returning `{ items, total, page, pageSize }` once a list can exceed ~100 rows.
- Dates in JSON: ISO 8601. Calendar days as `YYYY-MM-DD`; instants as full UTC timestamps.
- Money in JSON: `{ "amount": "1250.00", "currency": "AED" }` — amount is a string to avoid float loss.
- Errors: `{ statusCode, code, message, details?, requestId }`. Throw `AppError` (or `notFound`, `conflict`,
  `forbidden`). Validation errors arrive as `code: "request.invalid"` with `details.fields`.
- Status codes: 200 read/update, 201 create, 204 no body, 400 invalid, 401 not signed in, 403 not allowed,
  404 not found (also used when the caller must not learn a record exists), 409 conflict / invalid state transition.
- **Swagger is mandatory** on every route: `@ApiOperation({ summary, description })`, a typed success
  response and `@ApiErrors(...)`; every DTO field has `@ApiProperty({ example })`. Tags are
  `'<Module> · <Resource>'`, e.g. `'Organization · Companies'`. Checked by `test/docs/api-docs.e2e-spec.ts`.
- Every endpoint has a Bruno request in `bruno/<module>/`. How to test: [api-guide.md](api-guide.md).

## Layers

| Layer             | May                                                                             | Must not                             |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `api/`            | validate input, pick access rule, call one service method, map to response      | contain business rules, touch Prisma |
| `application/`    | orchestrate domain rules + repositories, emit events, check record-level access | know about HTTP (`Req`, `Res`)       |
| `domain/`         | pure functions/classes: rules, state machines, calculations                     | import Nest, Prisma or other layers  |
| `infrastructure/` | Prisma queries, transactions, audit rows, external clients                      | contain business decisions           |

State machines live in `domain/` as an explicit transition table, e.g.

```ts
export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  ...
};
```

An invalid transition throws `AppError('<entity>.invalid_transition', …, 409)`.

## Database

- One `.prisma` file per module in `prisma/schema/`. Models PascalCase singular; `@@map("snake_plural")`;
  columns `@map("snake_case")`.
- Primary keys `String @id @default(uuid(7)) @db.Uuid` unless a readable key is required.
- Timestamps `@db.Timestamptz(3)`; calendar days `@db.Date`; money `Decimal @db.Decimal(14, 2)` + `currency Char(3)`.
- Enums are UPPER_SNAKE in the database; the frontend label mapping happens in response classes.
- Every foreign key used in a filter gets an `@@index`. Name uniqueness gets `@@unique`.
- Sensitive values: `<field>Enc String` (ciphertext) + optional `<field>Idx String @unique` (blind index).
- Migrations: `npm run db:migrate -- --name <verb_noun>`. Review the generated SQL. Hand-written SQL (triggers,
  partial indexes, RLS) goes in the same migration file. Never edit a migration that has been merged.
- Writes that need an audit row run in `prisma.$transaction` and pass `tx` to `audit.record`.

## Testing

| Kind              | Where                         | Runs against               | Required for                                               |
| ----------------- | ----------------------------- | -------------------------- | ---------------------------------------------------------- |
| Unit              | `src/**/*.spec.ts`            | nothing (pure)             | every domain rule / state machine / calculation            |
| E2E               | `test/<module>/*.e2e-spec.ts` | real app + seeded Postgres | every endpoint: happy path + 403 for a role without access |
| Security baseline | `test/security/`              | real app                   | never loosened                                             |

Sign in with `signInAs(app, PERSONA.hr)`; send `Origin: http://localhost:3000` on POST/PATCH/DELETE.

## Git

- Branches: `feat/<module>-<thing>`, `fix/<module>-<thing>`, `chore/...`.
- Commits: Conventional Commits (`feat(org): add departments API`) — enforced by commitlint.
- One module per PR where possible. PR template checklist must be complete.
