# Employees

- Status: Planned
- Phase: 1
- Source module: `src/modules/employees/`

## Frontend sources

`lib/types.ts` (Employee, EmployeeProfile, BankDetails), `lib/data.ts`, `lib/employeeStore.ts` (`saveEmployee`
diff + audit, `addEmployee`, `canEditEmployees`, `canEditSensitive`), `lib/profiles.ts` (`REQUIRED_DOCS`),
`lib/options.ts` (IBAN mod-97, formats), `app/directory/**`, `app/profile`, `app/org-chart` (drag-to-reassign),
`app/documents`, `app/my/files`, `context/DocumentsContext.tsx`, `components/directory`, `components/profile`.

## Entities

- **Employee** (core table exists): code `GS-NNN` (sequence), work email (unique), names, company/department/
  designation **ids**, location, seating, reporting manager (self FK), role, status
  (ONBOARDING | ACTIVE | OFFBOARDING | INACTIVE), type (PERMANENT | CONTRACT | PROBATION), joining date,
  probation end, nationality, dob, exit reason/date, `hiredFrom` (candidate, job, offer).
- **Personal**: gender, marital status, blood group, personal email/mobile, current/permanent address, extension.
- **Identity (encrypted)**: passport no. + expiry; UAE: Emirates ID (`784-YYYY-NNNNNNN-N`), visa expiry,
  labour card issue/expiry; India: Aadhaar (12 digits), PAN (`ABCDE1234F`), UAN (12 digits).
- **Bank (encrypted)**: account name, number/IBAN, bank, branch code (IFSC / routing), currency, payment mode
  (UAE: WPS Transfer | Bank Transfer; India: Bank Transfer | Cheque).
- **Salary**: components (label, amount, earning/deduction), currency; UAE earnings Basic, Transportation,
  Accommodation; India Basic, HRA, Fixed, Other + deductions Advance, EPF, Other.
- Child tables: emergency contacts (UAE groups: Local, Home Country; India: Primary, Alternate), experience,
  education, family.
- **Documents**: type, file (Blob), expiry date, state derived (ok | soon | expired | na).

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
