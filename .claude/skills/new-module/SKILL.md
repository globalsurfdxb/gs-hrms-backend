---
name: new-module
description: Scaffold a new business module in src/modules (folder layout, Nest module, public file, module CLAUDE.md, Prisma schema file, docs spec, e2e test folder) following the org reference module. Use when starting a module such as employees, hiring, leave, expense.
---

# New module

Input: module name (kebab-case, e.g. `employees`). If `docs/modules/<name>.md` (or the spec that covers it) is
missing or still "Planned" without entities, run the `frontend-to-api` skill first.

1. Read `docs/architecture.md`, `docs/conventions.md` and the whole `src/modules/org/` folder — it is the template.
2. Create exactly this layout (only files you need now; empty folders are not committed):
   ```
   src/modules/<name>/
     CLAUDE.md                 # from the template below
     <name>.module.ts
     <name>.public.ts          # exports: module, read services, response types
     api/  application/  domain/  infrastructure/
   prisma/schema/<name>.prisma
   test/<name>/
   ```
3. `<name>.module.ts` registers controllers, services and repositories; exports only what `<name>.public.ts` re-exports.
4. Add the module to `src/app.module.ts` **through its public file**: `import { XModule } from './modules/<name>/<name>.public.js'`.
5. Name the module's permission features in `PERMISSIONS` (`src/core/iam/permission-catalog.ts`). Every frontend
   feature and its default grants already exist in `src/core/iam/feature-catalog.ts`; if the frontend changed them,
   port the change and refresh `test/fixtures/frontend-permissions.json` (`test/fixtures/README.md`).
6. Prisma: follow docs/conventions.md#database. Run `npx prisma validate`, then the `db-migration` skill.
7. Module `CLAUDE.md` template:
   ```md
   # <Module> module

   Spec: docs/modules/<spec>.md — read it first. Frontend sources: <files>.

   ## Rules specific to this module

   - State machines: <list with file in domain/>
   - Record-level access: <who sees what>
   - Business rule ids: BR-<MOD>-001 … (keep code comments and tests in sync)

   ## Do not

   - <module-specific pitfalls>
   ```
8. Run `npm run lint:arch && npm run typecheck`. Update the status in `docs/modules/README.md` and the module map
   in `docs/architecture.md`.

Then add endpoints one by one with the `new-endpoint` skill.
