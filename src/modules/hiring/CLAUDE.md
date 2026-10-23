# Hiring module

Spec: `docs/modules/hiring.md` — read it first (built step by step, plan in §11). Flow: `flow/src/08-hiring.html`.
Frontend sources (`gs-hrms`): `lib/hiringStore.ts` (every mutation), `lib/hiringTypes.ts`, `lib/hiringAccess.ts`,
`lib/hiringLetters.ts`, `lib/hiringMail.ts`, `lib/hiringHandoff.ts`, `components/hiring/HiringForms.tsx` (validation),
`app/hiring/**`, `app/careers/**`, `app/offer/respond/[token]`, `app/my/interviews`, `app/my/referrals`.
Before each step, check the frontend for changes since the commit noted in the spec and update spec + flow.

## Rules specific to this module

- Permissions: `PERMISSIONS.hiring.*` (frontend ids `hiring:requisitions:*`, `hiring:recruiting:*`,
  `hiring:reports:*`). Defaults: Super Admin + HR full; Team Lead + Office Admin requisitions only; Employee none.
- State machines (in `domain/`): requisition, job, application stage/exit, interview, offer — spec §4.
  The frontend store does not guard most status changes; enforce the transitions the UI shows, not the store's.
- Record-level access, in the repository query: Team Lead → requisitions they manage or raised; requisition step
  deciders per BR-HIR-002; panelists → their interviews; referrers → their referrals.
- Jobs (step 2): only Jobs permission holders (HR, Super Admin) reach them, and they see every job. Title, company,
  department, location, positions, budget and hiring manager are read from the requisition — never copy them.
  Every job change writes a `JobEvent` (History tab, append-only by trigger) and an audit row in one transaction.
- Salary (current/expected/offered) only for full access + that job's hiring manager — omit the fields otherwise.
- Public routes (careers, offer link) live in their own controllers with `@Public()` + reason; never reveal
  whether a person is already on file. Offer tokens are 256-bit, stored hashed.
- Letter HTML is rendered by the server from the sanitised template — never accepted from the client.
- Audit module name: `Hiring`. Business rules BR-HIR-001… with unit tests named after the id.

## Do not

- Set an application to HIRED except through an accepted offer (BR-HIR-013).
- Let a client set `FILLED` on a job — the system sets it from `filled` vs `positions`.
- Import onboarding/employees internals: hand-over goes through domain events.
