# 0002. NestJS 12 + Prisma 7 + PostgreSQL 16

- Status: Accepted
- Date: 2026-10-19

## Context

Team writes TypeScript (frontend is Next.js). Several developers will generate code with Claude Code, so the
stack must be conventional and well documented.

## Decision

- NestJS 12 (official template: ESM, Vitest, oxlint).
- Prisma 7 with the `prisma-client` generator and `@prisma/adapter-pg`; one schema file per module.
  (Prisma 8 was a release candidate at project start — upgrade once stable.)
- PostgreSQL 16 (Azure Database for PostgreSQL Flexible Server).
- class-validator DTOs + @nestjs/swagger for validation and the generated API contract.

## Consequences

- Readable schema and safe migrations; raw SQL (`$queryRaw` tagged templates) for heavy reports.
- ESM requires `.js` suffixes on relative imports.
