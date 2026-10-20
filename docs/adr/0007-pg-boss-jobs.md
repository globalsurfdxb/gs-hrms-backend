# 0007. pg-boss for background jobs

- Status: Accepted
- Date: 2026-10-19

## Context

Reminders (document expiry ladder), emails, attendance processing, scheduled reports and offer expiry need
reliable background execution. Load is small.

## Decision

pg-boss (queue stored in PostgreSQL). No Redis. Jobs are idempotent and keyed (e.g. reminder: document + rung +
expiry date) so retries never double-send.

## Consequences

One less service to run and secure. Revisit only if job volume grows by orders of magnitude.
