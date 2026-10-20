---
name: security-check
description: Review the current diff of the HRMS backend against the project security rules (docs/security.md) — access control, IDOR, scoping, mass assignment, sensitive data, audit, files, exports, public endpoints, logging. Use before opening a PR that touches auth, permissions, personal data, files, exports, money or public routes.
---

# Security check

1. Get the change: `git diff main...HEAD` (or `git diff` for uncommitted work). Read `docs/security.md`.
2. For every changed or new route, verify and report pass/fail with file:line:
   - [ ] exactly one access decorator; `@Public` has a written justification
   - [ ] record-level rule enforced in the service (own data / direct reports / assignment / not self-approval)
   - [ ] repository `where` includes the scope filter — no fetch-all-then-filter
   - [ ] caller identity only from `@CurrentUser()`
   - [ ] DTO: every field validated; no privilege-bearing fields; arrays/strings bounded
   - [ ] response class lists fields explicitly; passport/EID/Aadhaar/PAN/bank masked; salary only for allowed roles
   - [ ] sensitive columns written via `FieldCipher.encrypt`; blind index for lookups
   - [ ] audit row in the same transaction; no plain sensitive values in before/after
   - [ ] no logging of bodies, tokens, personal data; no `console.*`
   - [ ] raw SQL only via tagged `$queryRaw`; never `$queryRawUnsafe`
   - [ ] exports through `shared/security/csv.ts`, permission-checked, audited, rate-limited
   - [ ] uploads: type sniffed, size limited, private blob, scan gate, short SAS after permission check
   - [ ] public endpoints: rate limit, bot check, hashed expiring tokens, no existence disclosure
   - [ ] e2e tests include a 403/404 for each role that must not have access
3. Try to break it: for each endpoint, describe one concrete abuse attempt (change an id, add a field, call as
   Employee, replay a token) and state what stops it.
4. Report findings ranked by severity with a fix for each. Do not mark the check passed while any High remains.
