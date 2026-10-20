# Expense claims

- Status: Planned
- Phase: 4
- Source module: `src/modules/expense/`

## Frontend sources

`context/ExpenseContext.tsx` (`submitClaim`, `decide`, `withdrawClaim`, `claimRoute`, `canDecideClaim`, categories),
`app/expense/**`.

## Entities

Category: name, description, limits per currency (AED, INR), active. Claim: employee, category, amount (Decimal) +
currency, expense date, project, description, receipt (Blob), status (PENDING | APPROVED | REJECTED | WITHDRAWN),
submitted at, decided by/at, note.

## Rules

| Id         | Rule                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-EXP-001 | Receipt required when amount > min(category limit, 200 AED / 2000 INR)                                                                            |
| BR-EXP-002 | Claim within 90 days of expense date                                                                                                              |
| BR-EXP-003 | Duplicate warning: same employee, category, amount, date                                                                                          |
| BR-EXP-004 | Route to reporting manager; General Manager / no manager → Super Admin; over limit → extra management step (frontend promises, never implemented) |
| BR-EXP-005 | Totals per currency, never mixed                                                                                                                  |
| BR-EXP-006 | Withdraw only while PENDING (status WITHDRAWN — frontend deletes the row)                                                                         |
| BR-EXP-007 | Non-employees may file on behalf of others (audited)                                                                                              |
