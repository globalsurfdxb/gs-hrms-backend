# 0001. Modular monolith, not microservices

- Status: Accepted
- Date: 2026-10-19

## Context

~200 employees, ≤30 concurrent users, a small team that will grow, and workflows that cross modules constantly
(offer → onboarding → employee → leave → payroll). Microservices would add network calls, distributed
transactions, multiple deployments and duplicated auth for no scaling benefit.

## Decision

One NestJS application and one PostgreSQL database, split into business modules with enforced boundaries:
import only through `<module>.public.ts`, Prisma only in `infrastructure/`, cross-module side effects via events.
Boundaries are checked by dependency-cruiser in CI.

## Consequences

- One deploy, one transaction boundary, simple local setup.
- A module can be extracted later if ever needed, because its surface is already explicit.
- Discipline is enforced by tooling, not memory — never relax `.dependency-cruiser.cjs` to make code pass.
