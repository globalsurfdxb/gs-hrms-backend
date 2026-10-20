# GS HRMS Backend — rules for Claude and developers

NestJS 12 (ESM) modular monolith · PostgreSQL 16 · Prisma 7 · Vitest · Azure (UAE North).
HR system for ~200 employees in Dubai (UAE) and Kochi (India). It holds passports, visas, Emirates ID, Aadhaar,
PAN, bank and salary data — **treat every change as security-sensitive.**

Frontend (separate repo `gs-hrms`, Next.js) is the functional spec. Its mock stores (`lib/*Store.ts`,
`context/*Context.tsx`, `public/la/*.js`) describe the behaviour each API must implement.

## Read before working

- `docs/architecture.md` — layers, module map, how modules talk
- `docs/conventions.md` — naming, DTOs, errors, dates, money, database
- `docs/security.md` — the security rules below, in full
- `docs/modules/<module>.md` — entities, state machines, business rules (BR-xxx) for the module you touch
- `flow/` — plain-language flow diagrams (PDF) of every module, from the frontend
- `docs/api-guide.md` — how to read and test the API (Swagger UI, Bruno)
- The module's own `src/modules/<module>/CLAUDE.md`

## Non-negotiable rules

**Architecture**

1. Business code lives in `src/modules/<module>/` with the layout `api/ application/ domain/ infrastructure/`
   and one `<module>.public.ts`. Copy `src/modules/org/` — it is the reference implementation.
2. Import another module **only** through its `<module>.public.ts`. `core/` and `shared/` never import modules.
3. Only `infrastructure/*.repository.ts` touches Prisma. `domain/` is pure TypeScript (no Nest, no Prisma).
4. Cross-module side effects go through domain events, not direct calls into another module's internals.
5. `npm run lint:arch` enforces 2–3. Never weaken `.dependency-cruiser.cjs` to make code pass.

**Security**

6. Every route has exactly one of `@Public()`, `@SignedIn()`, `@RequirePermission(feature, action)`.
   No decorator = refused at runtime and fails CI. `@Public()` needs a reason in a comment.
7. Identity comes from `@CurrentUser()` only — never trust `employeeId`/`role` sent by the client.
8. Data-scope filtering (self / team / location / all) happens **in the repository query**, never in memory.
9. Responses are explicit `*Response` classes built field-by-field. Never return a Prisma record.
10. Sensitive fields (passport, Emirates ID, Aadhaar, PAN, bank account) are stored with `FieldCipher.encrypt`
    and returned masked unless the caller has the reveal permission.
11. Every create/update/delete writes an audit row **in the same transaction** (`audit.record(entry, tx)`).
    Never put decrypted sensitive values in audit `before`/`after`.
12. Never log request bodies, cookies, tokens or personal data. Use `AppError` for expected failures.
13. CSV exports use `shared/security/csv.ts`. User-supplied HTML (letter/email templates) is sanitised.
14. Never read, print or commit `.env`, keys or production data. Seed data is fictional.

**Every endpoint ships with (see `docs/api-guide.md` §6)**

15. **Swagger docs**: `@ApiOperation({ summary, description })` — the description says who may call it —
    a typed success response (`@ApiOkResponse` / `@ApiCreatedResponse` / `@ApiNoContentResponse`) and
    `@ApiErrors(...)` (from `core/http/api-docs.ts`) for every error status it can return. DTO fields have
    class-validator rules and `@ApiProperty({ example })`. CI fails if any route is undocumented.
16. **Tests**: e2e happy path + a 403/404 for each role without access.
17. **A Bruno request** in `bruno/<module>/` (`Origin: {{origin}}` header on writes, Docs tab, a test).
18. **Contract**: `npm run openapi:export` and commit `docs/api/openapi.json` (CI checks drift).
19. **Docs**: a row in `docs/modules/<module>.md`; if a business flow changed, update `flow/src/<module>.html`
    and run `npm run flow:pdf`.

**Other**

20. Permission feature ids must match the frontend catalogue (`gs-hrms/lib/access.ts`) — add them to
    `src/core/iam/permission-catalog.ts`.
21. Schema change → `npm run db:migrate -- --name <what>`; never edit an applied migration; never run
    `prisma migrate reset` or `db push` against a shared database.

## Commands

```bash
npm run db:up            # Postgres, Azurite, Mailpit, Gotenberg (Docker)
npm run db:migrate       # apply migrations (dev)
npm run db:seed          # fictional personas GS-120 (Super Admin) … GS-087 (Employee)
npm run start:dev        # http://localhost:3001/api · Swagger at /api/docs
npm run check            # format, lint, arch rules, typecheck, unit + e2e tests — run before finishing
```

ESM: relative imports end in `.js` (e.g. `./companies.service.js`).

## Skills (in `.claude/skills/`)

`new-module` · `new-endpoint` · `frontend-to-api` · `db-migration` · `security-check` · `module-docs` · `pr-ready`.
Use them — they encode the steps above. Never commit or push without the developer's explicit approval.
