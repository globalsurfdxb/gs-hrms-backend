# 0005. Leave balances as a ledger

- Status: Accepted
- Date: 2026-10-19

## Context

The frontend computes balances in two places with conflicting entitlements (React app vs `public/la` runtime).
Accruals, carry-forward, encashment, adjustments and paid/unpaid splits all change balances.

## Decision

Store every balance movement as a row (`ACCRUAL`, `TAKEN`, `REVERSAL`, `ADJUSTMENT`, `CARRY_FORWARD`,
`CARRY_FORWARD_EXPIRY`, `ENCASHMENT`) with employee, leave type, leave year, days and source reference.
Balance = sum. One calculation in `leave/domain`.

## Consequences

- Auditable, reproducible balances; corrections are new rows, never edits.
- Reports read the ledger directly.
