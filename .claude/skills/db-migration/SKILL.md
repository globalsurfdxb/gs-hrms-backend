---
name: db-migration
description: Change the PostgreSQL schema safely with Prisma — edit the module's .prisma file, create and review the migration SQL, add hand-written SQL when needed, regenerate the client and update seed/tests. Use for any model, column, index or enum change.
---

# Database migration

1. Edit only `prisma/schema/<module>.prisma` (models PascalCase, `@@map` snake_case plural, `@map` snake_case
   columns, uuid(7) ids, timestamptz(3), Decimal money, indexes on filtered FKs — docs/conventions.md#database).
2. `npx prisma format && npx prisma validate`.
3. Create without applying: `npx prisma migrate dev --name <verb_noun> --create-only`.
4. Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`:
   - Destructive (DROP COLUMN/TABLE, type narrowing, NOT NULL on existing data)? Stop and propose an
     expand → backfill → contract sequence across releases instead. Requires an ADR or lead approval.
   - Add hand-written SQL in the same file when needed: triggers, CHECK constraints, partial indexes, RLS.
5. Apply: `npm run db:migrate`. Never edit a migration that is already on `main`.
6. `npm run db:generate` (runs automatically after migrate), update `prisma/seed.ts` if new reference data is
   needed (fictional data only, idempotent upserts), run `npm run check`.
7. Never run `prisma migrate reset` or `prisma db push` — they are denied in settings. If the local database is
   broken, ask the developer to reset it themselves.
