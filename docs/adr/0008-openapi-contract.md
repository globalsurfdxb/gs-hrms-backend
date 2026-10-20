# 0008. Generated OpenAPI as the frontend contract

- Status: Accepted
- Date: 2026-10-19

## Context

Frontend and backend are separate repositories developed by different people.

## Decision

The OpenAPI document is generated from controllers and DTOs (`npm run openapi:export`) and committed at
`docs/api/openapi.json`. CI fails if it differs from the code. The frontend generates its typed client from it.
Swagger UI is available outside production at `/api/docs`.

## Consequences

API documentation cannot go stale. Breaking changes are visible in PR diffs of `openapi.json`.
