# Leave & attendance

- Status: Planned — **blocked on open decisions 3 and 4** (roadmap)
- Phase: 3
- Source modules: `src/modules/leave/`, `src/modules/attendance/`

## Frontend sources

Two implementations sharing a sessionStorage ledger (`la.ledger.v1`):

- React: `lib/leaveBridge.ts` (`balanceOf`, `approverFor`, `submitLeave`, `decideLeave`, `workingDays`),
  `app/my/leave-attendance`, `app/team/leave`, `app/team/attendance`.
- Vanilla JS runtime (much richer): `public/la/la-core.js` (types, policies, seed), `la-leave.js`, `la-att.js`,
  `la-home.js`, `la-ops1.js`, `la-ops2.js`, mounted by `components/la/LaHost.tsx`.
  Their entitlements conflict (React Annual 21 / Sick 10 / Casual 7 vs runtime UAE AL 30 / SL 90). Past attendance
  in the runtime is generated from a hash. **One model, one calculation** on the backend ([ADR-0005](../adr/0005-leave-ledger.md)).

## Entities (target)

- **Policy per location**: work week & hours (structured, not text), weekly offs, weekly hours (UAE 41.5, India 45),
  probation 6 months, monitoring window (UAE rolling 12 months; India Apr–Mar), HR-confirmable settings
  (half/full day thresholds, late minutes, carry-forward, encashment formula, comp-off ratio 8, OT rounding, …).
- **Leave type** per template: UAE AL 30 (2.5/month), SL 90 (15 full / 30 half / 45 unpaid), Compassionate,
  Maternity (45 full + 15 half), Parental, Hajj, Umrah, Study, Restricted Festive, Unpaid, Casual;
  India CL 12, EL 15 (1.25/month), SK 12, Maternity 26 weeks, Paternity, Marriage, Bereavement, LOP;
  plus Compensatory Off and WFH. Eligibility (gender, once-per-service, service length), caps, required documents.
- **Holiday** (location or template, approximate flag for moon-dependent Eid), **Shift**, **Ramadan schedule** (UAE).
- **Leave request**: type, from/to, days, half-day, reason, document, status (PENDING | APPROVED | REJECTED |
  WITHDRAWN | CANCELLED), workflow instance, exception flag + reason, extension-of, linked paid/unpaid pair.
- **Leave ledger** rows; annual-leave plan segments; carry-forward; encashment; medical verification.
- **Attendance**: raw punches (device, IN/OUT), sessions (web/biometric/remote, IP), daily record (status from ~30
  status master), regularisation and late/early/shift requests, manual corrections (reason + attachment),
  exceptions, overtime, occurrences & discipline cases, payroll periods (NOT_STARTED | OPEN | LOCKED), devices.

## Key rules

| Id        | Rule                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| BR-LV-001 | Days counted as working days for the employee's location (weekly offs + holidays excluded)                                   |
| BR-LV-002 | Back-dating ≤ 30 days; no overlap with pending/approved leave or plan segments                                               |
| BR-LV-003 | Withdraw only while PENDING; cancel approved only if start is in the future (else HR adjustment)                             |
| BR-LV-004 | Insufficient balance + "convert excess to unpaid" ⇒ split into linked paid + unpaid requests                                 |
| BR-LV-005 | Annual leave segments: ≤ 3 per year, each ≥ 7 calendar days, ≥ 90 days apart                                                 |
| BR-LV-006 | Sick certificate: UAE ≥ 2 days or a Monday; India > 2 days                                                                   |
| BR-LV-007 | Carry-forward ≤ 5 days, one pending per employee, expires 31 Mar next year; encashment ≤ 10 days                             |
| BR-AT-001 | Daily record priority: weekly off > holiday > approved leave > punches; worked = first in → last out; payable capped 480 min |
| BR-AT-002 | Regularisation: not future, not weekly off, one pending/approved per date; approval resolves exceptions                      |
| BR-AT-003 | Overtime: filed within 14 days, not future, once per date; category must match calendar                                      |
| BR-AT-004 | Occurrence thresholds 2/3/6/8/10 → Verbal/First/Second/Final/Termination review; HR confirms every outcome                   |
| BR-AT-005 | Period lock requires confirmation; HR override if exceptions open; reopen requires reason                                    |

## Access

Employee: own; Team Lead: direct reports + items routed to them; HR/Admin: organisation & operations;
Super Admin only: companies, roles, biometric devices, integrations. Approver is never the requester or someone
reporting to them.
