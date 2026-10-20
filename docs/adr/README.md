# Architecture decision records

One file per significant decision: context, decision, consequences. Never edit an accepted ADR's decision —
supersede it with a new one. Template: `0000-template.md`.

| #                                         | Decision                                      | Status   |
| ----------------------------------------- | --------------------------------------------- | -------- |
| [0001](0001-modular-monolith.md)          | Modular monolith, not microservices           | Accepted |
| [0002](0002-nestjs-prisma-postgres.md)    | NestJS 12 + Prisma 7 + PostgreSQL 16          | Accepted |
| [0003](0003-entra-sso-server-sessions.md) | Microsoft Entra SSO with server-side sessions | Accepted |
| [0004](0004-workflow-engine.md)           | One approval workflow engine for all modules  | Accepted |
| [0005](0005-leave-ledger.md)              | Leave balances as a ledger                    | Accepted |
| [0006](0006-azure-hosting.md)             | Azure (UAE North) for all hosting             | Accepted |
| [0007](0007-pg-boss-jobs.md)              | pg-boss for background jobs                   | Accepted |
| [0008](0008-openapi-contract.md)          | Generated OpenAPI as the frontend contract    | Accepted |
