---
name: frontend-to-api
description: Analyse the gs-hrms frontend for one module (pages, stores, contexts, types) and write or update its backend spec in docs/modules — entities, state machines, business rules, access rules and the endpoint list. Use before building or extending a module.
---

# Frontend → API spec

The frontend repo (`gs-hrms`) is the functional spec. Ask the developer for its local path if it is not a sibling
folder (`../HRMS - Frontend/gs-hrms` is common).

1. Read the existing `docs/modules/<spec>.md` — keep what is correct, extend it.
2. Find the sources: `lib/types.ts`, the module's store in `lib/`, its `context/*Context.tsx`, every page in
   `app/<module>/**`, components, and `lib/access.ts` (permission ids), `lib/guard.ts` (route rules),
   `lib/workflow.ts` (approval chains). For leave/attendance also `public/la/*.js`.
3. Extract, citing file paths:
   - entities + fields + enums (map names to ids; money to Decimal + currency; dates to date vs timestamptz)
   - every mutation function → one endpoint each
   - status values and **every** transition with its guard condition → state diagram
   - validations and calculations → numbered business rules `BR-<MOD>-NNN`
   - who can see/do what (role, direct reports, self, assignment) → access table
   - notifications/emails triggered
4. List explicitly what the frontend **fakes or leaves undefined** (no persistence, no email, unreachable states,
   duplicated logic) under "Gaps" and add questions to "Open questions" — never invent business rules silently.
5. Fill the template sections of `docs/modules/_TEMPLATE.md` including a Threat model.
6. Output a short summary: endpoints to build, open questions for the lead.
