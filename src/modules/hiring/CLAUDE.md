# Hiring module

Spec: `docs/modules/hiring.md` — read it first (built step by step, plan in §11). Flow: `flow/src/08-hiring.html`.
Frontend sources (`gs-hrms`): `lib/hiringStore.ts` (every mutation), `lib/hiringTypes.ts`, `lib/hiringAccess.ts`,
`lib/hiringLetters.ts`, `lib/hiringMail.ts`, `lib/hiringHandoff.ts`, `lib/hiringDocs.ts` (pre-offer documents),
`components/hiring/HiringForms.tsx` (validation), `components/hiring/DocCollection.tsx`, `app/hiring/**`,
`app/careers/**`, `app/offer/respond/[token]`, `app/offer/documents/[token]`, `app/my/interviews`, `app/my/referrals`.
Before each step, check the frontend for changes since the commit noted in the spec and update spec + flow.

## Rules specific to this module

- Permissions: `PERMISSIONS.hiring.*` (frontend ids `hiring:requisitions:*`, `hiring:recruiting:*`,
  `hiring:reports:*`). Defaults: Super Admin + HR full; Talent Acquisition Manager all hiring, no delete; Recruiter
  Recruiting only, no delete; Team Lead + Office Admin requisitions only; Employee none. Decide by permission, never by
  role name or designation (Q21). Full hiring access = Jobs → View AND Requisitions → View (`hasFullHiringAccess` in
  `application/hiring-access.ts`, Q22). Anyone else works on their own jobs only (BR-HIR-022): every read and write
  of jobs, applications and candidates goes through `job-scope.where.ts` in the repository; another record is a 404.
- State machines (in `domain/`): requisition, job, application stage/exit, interview, offer — spec §4.
  The frontend store does not guard most status changes; enforce the transitions the UI shows, not the store's.
- Record-level access, in the repository query: Team Lead → requisitions they manage or raised; requisition step
  deciders per BR-HIR-002; panelists → their interviews; referrers → their referrals.
- Jobs (step 2): only Jobs permission holders reach them; without full access only their own jobs (recruiter or
  hiring manager). Create, status and recruiter choice need full access (step 3.1d moves recruiter choice to the
  Talent Acquisition Manager, BR-HIR-021). Title, company,
  department, location, positions, budget and hiring manager are read from the requisition — never copy them.
  Every job change writes a `JobEvent` (History tab, append-only by trigger) and an audit row in one transaction.
- Candidates (step 3): full access sees every candidate; others only candidates on their own jobs, with only those
  applications, and must add new ones onto one of their jobs. Duplicate = same email or last-9 phone digits → 409
  `candidate.duplicate` with `details.candidateId` — no details (and no match in `/duplicates`) when the caller may not
  see that candidate. Applications only to OPEN jobs. Pipeline
  rules live in `domain/application.rules.ts`; a SENT offer blocks exits and leaving OFFER (`offerSent`, wired to
  offers in step 5). Notes and stage history are append-only by trigger.
- Salary (current/expected/offered) only for full hiring access + that job's hiring manager and recruiter — omit the fields
  otherwise; never in audit amounts or logs (spec Q8); a view of a record with salary writes an audit row.
- Pre-offer documents (step 5a) gate offer creation (VERIFIED or WAIVED); their files are identity documents —
  private Blob, scanned, short-lived download links, audited.
- Public routes (careers, offer link, documents link) live in their own controllers with `@Public()` + reason; never reveal
  whether a person is already on file. Offer tokens are 256-bit, stored hashed.
- Letter HTML is rendered by the server from the sanitised template — never accepted from the client.
- Audit module name: `Hiring`. Business rules BR-HIR-001… with unit tests named after the id.

## Do not

- Set an application to HIRED except through an accepted offer (BR-HIR-013).
- Let a client set `FILLED` on a job — the system sets it from `filled` vs `positions`.
- Import onboarding/employees internals: hand-over goes through domain events.
