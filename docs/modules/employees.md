# Employees

- Status: Planned
- Phase: 1
- Source module: `src/modules/employees/`

## Frontend sources

`lib/types.ts` (Employee, EmployeeProfile, BankDetails), `lib/data.ts`, `lib/employeeStore.ts` (`saveEmployee`
diff + audit, `addEmployee`, `canEditEmployees`, `canEditSensitive`), `lib/profiles.ts` (`REQUIRED_DOCS`),
`lib/options.ts` (IBAN mod-97, IFSC, India account number, formats), `app/directory/**`
(`components/directory/DirectoryView.tsx` — status tabs, facets, sort), `app/profile`, `app/org-chart` (drag-to-reassign),
`app/documents`, `app/my/files`, `context/DocumentsContext.tsx`, `components/directory`, `components/profile`.

## Entities

- **Employee** (core table exists): code `GS-NNN` (sequence), work email (unique), names, company/department/
  designation **ids**, location, seating, reporting manager (self FK), role, status
  (ONBOARDING | ACTIVE | OFFBOARDING | INACTIVE), type (PERMANENT | CONTRACT | PROBATION), joining date,
  probation end, nationality, dob, exit reason/date, `hiredFrom` (candidate, job, offer).
- **Personal**: gender, marital status, blood group, personal email/mobile, current/permanent address, extension.
  India also keeps first / middle / last name (full name stays "as per passport").
- **PF (India)**: already enrolled (Yes/No), UAN-linked mobile, previous PF member ID, EPS eligibility
  (Eligible | Not eligible | Not sure).
- **Identity (encrypted)**: passport no. + expiry; UAE: Emirates ID (`784-YYYY-NNNNNNN-N`), visa expiry,
  labour card issue/expiry; India: Aadhaar (12 digits) + name as per Aadhaar, PAN (`ABCDE1234F`) + name as per
  PAN, UAN (12 digits), name as per passport. Passport number is **required for UAE only** (optional for India).
- **Bank (encrypted)**: account name, number/IBAN, bank, branch code (IFSC / routing), branch name (India),
  currency, payment mode
  (UAE: WPS Transfer | Bank Transfer; India: Bank Transfer | Cheque).
- **Salary**: components (label, amount, earning/deduction), currency; UAE earnings Basic, Transportation,
  Accommodation; India Basic, HRA, Fixed, Other + deductions Advance, EPF, Other. Onboarding adds computed
  statutory deductions (India EPF, ESI, Professional Tax; UAE Pension 11 % for nationals) — see
  `onboarding-offboarding.md`.
- Child tables: emergency contacts (UAE groups: Local, Home Country; India: Primary, Alternate), experience
  (+ optional experience letter), education (+ optional certificate), family (name, relationship, occupation,
  date of birth).
- **Documents**: type, file (Blob), expiry date, state derived (ok | soon | expired | na), optional free-text
  details (passport / Aadhaar details, certificate qualification & institution).
- **Required documents** (`REQUIRED_DOCS`): UAE — Passport Copy, Signed Company Offer Letter, Attested Educational
  Certificate, Labour Card, Residence Visa, Emirates ID, Signed NDA, UAE Driving Licence, Medical Insurance
  E-Card, Passport Size Photo. India — Signed Company Offer Letter, Highest Educational Certificate, PAN Card,
  Aadhaar Card, Passbook / Bank Statement, Signed NDA, Signed Employment Contract, Passport Size Photo
  (Casual Photo, Insurance Document and the India Passport Copy are no longer required).

## Business rules

| Id         | Rule                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-EMP-001 | Location template decides which identity/bank fields are valid; changing location clears the other country's fields and re-validates department/designation |
| BR-EMP-002 | Department must belong to the company and operate in the location                                                                                           |
| BR-EMP-003 | Reporting line cannot form a cycle (org-chart reassign)                                                                                                     |
| BR-EMP-004 | email, employeeCode, employmentStatus are never edited directly (status changes only via onboarding/offboarding)                                            |
| BR-EMP-005 | Every field change is audited field-by-field (module Employee / Bank / Salary); sensitive values masked in audit                                            |
| BR-EMP-006 | Uploads: pdf, png, jpg, jpeg, doc, docx ≤ 10 MB; required documents per template                                                                            |
| BR-EMP-007 | Self-service: employee edits only mobile directly; everything else via requests                                                                             |
| BR-EMP-008 | India identity: Aadhaar and PAN each carry the name as printed; PF enrolled = Yes requires a 12-digit UAN and the UAN-linked mobile                         |
| BR-EMP-009 | Bank account number is confirmed by typing it twice on capture (onboarding wizard, joining form); India account 9–18 digits, IFSC validated                 |

## Directory list

Status tabs with counts (All + each employment status); toolbar facets Location and Department; _More filters_:
Company, Designation, Reports to (incl. "No manager"; hidden in team view), Employment type, Nationality,
Documents = "Expired documents". Each facet shows how many people a choice leaves given the other filters
(zero-result choices disabled); active filters show as removable tags; search; sort: default, Name A–Z,
Department, Newest joiners, Longest serving. → `GET /employees` needs these filters, a `sort` param and a
**facet counts** response computed in the scoped query (never from an unscoped count).

## Access

| Action                             | Rule                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Directory list/detail              | ALL for Super Admin/HR/Office Admin; TEAM (direct reports) for Team Lead; SELF for Employee |
| Edit employee                      | Super Admin, HR, Office Admin                                                               |
| Bank & PF, Salary tabs (view/edit) | Super Admin, HR only                                                                        |
| Reveal full identity numbers       | dedicated permission, audited                                                               |

## Threat model

Highest-sensitivity module. IDOR on `/employees/:code`, salary exposure to Team Leads, mass assignment of
`role`/`status`, bulk export abuse. Mitigate with scoped repository, field-level response classes per access
level, explicit DTOs, export audit and rate limit.
