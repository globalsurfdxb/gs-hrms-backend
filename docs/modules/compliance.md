# Compliance — visa & document expiry

- Status: Planned
- Phase: 1
- Source module: `src/modules/compliance/`

## Frontend sources

`components/visa/VisaView.tsx`, `app/visa`, `app/team/visa`, `context/ExpiryContext.tsx`, `lib/expiryRegister.ts`,
`lib/reminderRules.ts`, `components/expiry/*`, `app/employee-expiry`, `app/my/expiry`, `app/team/expiry`.

## Entities

- Dated document types: Passport, Residence Visa, Emirates ID, Labour Card, Medical Insurance, UAE Driving Licence,
  Professional Licence, Insurance Document (+ custom dated documents).
- Renewal history: previous expiry, new expiry, renewed on, reference.
- Reminder log: document, rung, sent on, recipients, expiry — **dedupe key (document, rung, expiry)**.
- Reminder schedules (see platform.md).

## Rules

| Id         | Rule                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| BR-CMP-001 | Visa module applies to UAE-template locations only; inactive employees excluded                                  |
| BR-CMP-002 | State: expired (< today), soon (≤ 90 days), ok                                                                   |
| BR-CMP-003 | Due rung = smallest rung ≥ days left; a daily job sends each rung once                                           |
| BR-CMP-004 | Recipients: employee + HR; reporting manager added for rungs ≤ 30 days and manual reminders; expired → escalated |
| BR-CMP-005 | Mandatory: Residence Visa, Emirates ID, Labour Card, Passport — any expired ⇒ employee non-compliant             |
| BR-CMP-006 | Renewal: new expiry must be in the future and later than current; optional new EID expiry                        |
| BR-CMP-007 | A dated document counts as valid only with a file on record                                                      |

Jobs: `compliance.reminders.daily` (pg-boss, idempotent per dedupe key).
