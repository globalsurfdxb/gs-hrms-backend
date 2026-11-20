# Employees

- Status: In progress — data scopes, directory (list, detail), profile details (read, edit), employment details
  (edit) and identity, bank & PF (masked, reveal) done
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

| Id         | Rule                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-EMP-001 | Location template decides which identity/bank fields are valid; changing location clears the other country's fields and re-validates department/designation          |
| BR-EMP-002 | Department must belong to the company and operate in the location                                                                                                    |
| BR-EMP-003 | Reporting line cannot form a cycle (org-chart reassign)                                                                                                              |
| BR-EMP-004 | email, employeeCode, employmentStatus are never edited directly (status changes only via onboarding/offboarding)                                                     |
| BR-EMP-005 | Every field change is audited field-by-field (module Employee / Bank / Salary); sensitive values masked in audit                                                     |
| BR-EMP-006 | Uploads: pdf, png, jpg, jpeg, doc, docx ≤ 10 MB; required documents per template                                                                                     |
| BR-EMP-007 | Self-service: employee edits only mobile directly; everything else via requests                                                                                      |
| BR-EMP-008 | India identity: Aadhaar and PAN each carry the name as printed; PF enrolled = Yes requires a 12-digit UAN and the UAN-linked mobile                                  |
| BR-EMP-009 | Bank account number is confirmed by typing it twice on capture (onboarding wizard, joining form); India account 9–18 digits, IFSC validated                          |
| BR-EMP-010 | Emergency contact groups follow the work location: UAE — Local Emergency Contact (UAE), Home Country Emergency Contact; India — Primary, Alternate Emergency Contact |

## Directory list

Status tabs with counts (All + each employment status); toolbar facets Location and Department; _More filters_:
Company, Designation, Reports to (incl. "No manager"; hidden in team view), Employment type, Nationality,
Documents = "Expired documents". Each facet shows how many people a choice leaves given the other filters
(zero-result choices disabled); active filters show as removable tags; search; sort: default, Name A–Z,
Department, Newest joiners, Longest serving. → `GET /employees` needs these filters, a `sort` param and a
**facet counts** response computed in the scoped query (never from an unscoped count).

## Access

| Action                            | Rule                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| Directory list/detail             | Data scope by permission (`core/iam/data-scope.ts`): see below |
| Edit employee                     | Super Admin, HR, Office Admin                                  |
| Identity, Bank & PF (view masked) | Identity & bank details → View (Super Admin, HR); own record   |
| Identity, Bank & PF (edit)        | Identity & bank details → Edit (Super Admin, HR)               |
| Reveal full identity/bank numbers | Reveal full numbers (Super Admin, HR), every reveal audited    |
| Salary tab (view/edit)            | Super Admin, HR only (to do)                                   |

### Profile — done

Tables `employee_profiles` (1:1) and `employee_emergency_contacts`, `employee_experience`, `employee_education`,
`employee_family` (ordered by `position`; a save replaces a list). Values use the frontend labels (`lib/options.ts`),
checked by the DTOs and by CHECK constraints. Editing needs Directory → Edit in Organization or Operations
(`application/employee-access.ts`); Team → Directory → Edit does not edit records. Tests: `domain/profile.rules.spec.ts`,
`application/employee-access.spec.ts`, `test/employees/profile.e2e-spec.ts`.

### Employment details — done

Name, work location, organization, department, designation, reporting manager, employment type and joining date on
the `employees` row (`PATCH …/employment`, Directory → Edit). Only the parts that change are re-checked, so older
data never blocks an unrelated save. BR-EMP-002: the organization operates in the location (`companies.location_id`
null = everywhere), the department belongs to the organization and has the location, the designation belongs to the
department, a newly chosen organization is active. BR-EMP-003: the manager exists, is not the employee, is not
inactive and does not report to the employee, directly or indirectly (walking up from the new manager must not reach
the employee).
BR-EMP-001 / 010: a move between UAE and India switches emergency contact groups (Local ↔ Primary, Home Country ↔
Alternate), clears a seating location the new office does not list, and clears the other country's identity fields
and the bank details (see Identity, bank & PF). The audit row (`employee.employment_updated`) records readable values (names, "Name
(GS-NNN)"), not ids. Tests: `domain/employment.rules.spec.ts`, `test/employees/employment.e2e-spec.ts`.

### Identity, bank & PF — done

Table `employee_identity_bank` (1:1). Passport, Emirates ID, Aadhaar, PAN, UAN and account number / IBAN are stored
as `FieldCipher` output (`*_enc` columns), returned masked to the last 4 characters, and masked in the audit log.
Permissions (Employee Management → Identity & bank, HR and Super Admin by default):

| Feature                 | View                                          | Edit                                      |
| ----------------------- | --------------------------------------------- | ----------------------------------------- |
| Identity & bank details | read masked, within the directory scope       | change, within the Directory → Edit scope |
| Reveal full numbers     | `POST …/reveal` one number; audited, no value | —                                         |

Anyone may read their own record (masked). Out of scope is 404. BR-EMP-001: the other country's fields are refused
(UAE: Emirates ID, visa, labour card; India: Aadhaar, PAN, UAN / PF, names as printed, branch name); payment modes
follow the location; a move clears the other country's fields and the bank details, never the passport.
BR-EMP-008: Emirates ID `784-YYYY-NNNNNNN-N`, Aadhaar and UAN 12 digits, PAN `ABCDE1234F`; PF enrolled = Yes needs
the UAN and its linked mobile. BR-EMP-009: UAE IBAN AE + 21 digits with checksum; India account 9–18 digits with an
IFSC. The passport number cannot be cleared for UAE. Formats are checked only for fields a save changes. Audit rows:
`employee.identity_updated` (module Employee), `employee.bank_updated` (module Bank), `employee.number_revealed`.
Tests: `domain/identity-bank.rules.spec.ts`, `test/employees/identity-bank.e2e-spec.ts`.

### Data scopes — done

Decided by permission, never by role name, so custom roles follow their grants (same rule as the frontend
`lib/guard.ts` and `DirectoryView`). Applied in the repository query (`infrastructure/employee-scope.where.ts`);
anyone out of scope is 404 `employee.not_found`, the same as a code that does not exist.

| Scope | Granted by                                             | Default roles                         |
| ----- | ------------------------------------------------------ | ------------------------------------- |
| ALL   | Directory → View (Organization or Operations)          | Super Admin, HR, Office Admin         |
| TEAM  | Team → Directory: self + direct reports (not the tree) | Team Lead, Talent Acquisition Manager |
| SELF  | anything else: own record only                         | Recruiter, Employee                   |

Office Admin's "own location" in the frontend (`defaultScope`) is only the starting value of a location filter they
can change, so it is not a restriction. Editing needs Directory → Edit in Organization or Operations (see Profile).
Tests: `core/iam/data-scope.spec.ts`, `test/employees/directory.e2e-spec.ts`.

## Endpoints

| Status | Method | Path                                                | Access                                        | Notes                                                                                                                                                                              |
| ------ | ------ | --------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | GET    | `/api/employees`                                    | signed in, scoped                             | paged; `q` (name, code, email), `status`, `type`, `companyId`, `departmentId`, `designationId`, `locationId`; returns `scope`                                                      |
| ✅     | GET    | `/api/employees/:employeeCode`                      | signed in, scoped                             | directory fields only; any case                                                                                                                                                    |
| ✅     | GET    | `/api/employees/:employeeCode/profile`              | signed in, scoped                             | personal details, emergency contacts, experience, education, family; `canEdit`                                                                                                     |
| ✅     | PATCH  | `/api/employees/:employeeCode/profile`              | Directory → Edit (Organization or Operations) | fields left out unchanged, null/"" clears, lists replace; BR-EMP-010; one audit row `employee.profile_updated` (lists summarised: names or entry counts); no-op writes nothing     |
| to do  | GET    | `/api/employees` facets, sort                       |                                               | facet counts computed in the scoped query; Reports to, Nationality, Expired documents                                                                                              |
| ✅     | GET    | `/api/employees/:employeeCode/identity-bank`        | Identity & bank details → View, scoped; own   | numbers masked; `template`, `currency`, `canEdit`, `canReveal`                                                                                                                     |
| ✅     | PATCH  | `/api/employees/:employeeCode/identity-bank`        | Identity & bank details → Edit, edit scope    | encrypted numbers; BR-EMP-001/008/009; audit rows `employee.identity_updated` / `employee.bank_updated`, masked; no-op writes nothing                                              |
| ✅     | POST   | `/api/employees/:employeeCode/identity-bank/reveal` | Reveal full numbers, scoped                   | one number; audit row `employee.number_revealed` names the field only                                                                                                              |
| to do  |        | salary, documents                                   |                                               | Salary tab (Super Admin, HR); documents need file storage                                                                                                                          |
| ✅     | PATCH  | `/api/employees/:employeeCode/employment`           | Directory → Edit (Organization or Operations) | name, location, organization, department, designation, manager, type, joining date; BR-EMP-001…004, 010; one audit row `employee.employment_updated`; returns the directory record |

## Threat model

Highest-sensitivity module. IDOR on `/employees/:code`, salary exposure to Team Leads, mass assignment of
`role`/`status`, bulk export abuse. Mitigate with scoped repository, field-level response classes per access
level, explicit DTOs, export audit and rate limit.
