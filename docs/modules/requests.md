# Employee requests

- Status: Planned
- Phase: 1
- Source module: `src/modules/requests/`

## Frontend sources

`context/RequestsContext.tsx` (`raise`, `act`, `routeFor`, `canDecideRequest`), `components/profile/NewRequestDrawer.tsx`,
`components/requests/RequestsView.tsx`, `app/requests`, `app/my/requests`, `app/team/requests`.

## Entity

Request: employee, type (INFORMATION_UPDATE | DOCUMENT_REQUEST | ADDRESS_CHANGE | BANK_DETAIL_UPDATE | OTHER),
details, `changes` (field → proposed value, applied only on approval), status (PENDING | APPROVED | REJECTED),
routed to (MANAGER | HR), raised at, decided by/at, note.

- Changeable fields via Information Update: personalMobile, personalEmail, maritalStatus, bloodGroup, gender,
  nationality, name, dob.
- Letter types (Document Request): Salary certificate, Employment letter, Experience letter, NOC,
  Visa support letter, Bank letter → generated PDF from template on approval (frontend generates nothing today).

## Rules

| Id         | Rule                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BR-REQ-001 | Information Update → reporting manager; all other types → HR (via workflow engine)                                                  |
| BR-REQ-002 | Nobody decides their own request                                                                                                    |
| BR-REQ-003 | HR and Super Admin decide any; Office Admin any except Bank Detail Update; Team Lead only Manager-routed requests of direct reports |
| BR-REQ-004 | Approval applies `changes` through the employees module (audited per field) in the same transaction                                 |
| BR-REQ-005 | Bank detail changes are encrypted at rest inside `changes` too                                                                      |

## Threat model

Request → approval is a path to change bank details: require HR-only approval, notify the employee on every
bank change, audit.
