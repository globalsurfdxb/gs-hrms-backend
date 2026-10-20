# Security

Target: **OWASP ASVS Level 2**. The system stores identity documents, bank and salary data for staff in the UAE
(PDPL) and India (DPDP Act 2023). Assume every layer can fail and make the next one hold.

## 1. Identity and sessions

- **Microsoft Entra ID only** in production (all staff have M365). Single tenant; MFA and Conditional Access are
  enforced by Entra. No passwords are stored. Emergency access uses tenant break-glass accounts, not an app backdoor.
- Authorization-code flow with PKCE via MSAL Node (`core/auth/providers/entra.provider.ts`). MSAL validates the
  ID token; we additionally pin the tenant id and nonce, and check `state`.
- Accounts are matched on Entra **object id (`oid`)**. Email is used once, to link an unlinked HRMS employee on
  first sign-in.
- Sessions are server-side (`sessions` table). The cookie holds a random 256-bit token; the database stores only
  its SHA-256 hash. Cookie: `__Host-hrms_sid`, httpOnly, Secure, SameSite=Lax.
- Idle timeout 30 min, absolute 12 h. A session dies immediately when the employee is `INACTIVE`.
  Call `SessionService.revokeAllForEmployee` on offboarding and on role change.
- **Dev login** (`POST /api/auth/dev/login`) exists for local work and tests. It is refused when
  `NODE_ENV=production` — by env validation at boot and again at runtime.

## 2. Access control (the biggest real risk)

- **Deny by default.** `PermissionsGuard` refuses any route without `@Public`, `@SignedIn` or
  `@RequirePermission`. `test/security/route-guards.e2e-spec.ts` fails CI if one is missing.
- Permission keys match the frontend catalogue (`lib/access.ts`): `<feature>` = View, `<feature>#add|edit|delete`.
- **Record-level rules** belong in `application/` policies and are tested per role:
  - Team Lead → direct reports only; Employee → self only.
  - Nobody decides their own request; approver resolution comes from the workflow engine.
  - Interviewers see only candidates they are assigned to.
  - Salary data → HR/Super Admin and the job's hiring manager only.
- **Scope in the query.** Repositories filter by `DataScope`; never load-all-then-filter.
- **Return 404, not 403**, when the caller must not learn that a record exists (another employee's request).
- **Mass assignment** is blocked globally (`forbidNonWhitelisted`). DTOs never contain `role`, `status`,
  `employeeId`-of-self or salary fields unless the endpoint is specifically for changing them.

## 3. Data protection

- TLS everywhere (Front Door → App Service → Postgres `sslmode=require`).
- Encryption at rest by Azure (disks, backups, Blob).
- **Field encryption** for passport no., Emirates ID, Aadhaar, PAN, bank account/IBAN: AES-256-GCM via
  `FieldCipher`. Blind index (HMAC) for exact-match search. Keys are in Key Vault, surfaced to the app through
  Key Vault references; rotation adds a new key version prefix (`v2.`) and re-encrypts in a job.
- **Masking**: list and detail views return `mask(value)` unless the caller has the reveal permission;
  every reveal is audited.
- **Files**: private container, random blob names, permission check before issuing a ≤5-minute user-delegation
  SAS, Defender for Storage malware scan before a file becomes downloadable, content-type sniffing, size limits.
- **Logs**: pino redacts cookies and auth headers. Never log bodies or personal data.
- **Non-production** uses fictional seed data only. Production data is never copied to dev/staging.
- **Retention**: candidate data deleted/anonymised after the consent period; audit kept per policy.

## 4. Input, output and rendering

- Validation on every DTO (class-validator), body limit 1 MB, uploads via dedicated endpoints with their own limits.
- SQL only through Prisma or `$queryRaw` tagged templates. `$queryRawUnsafe` is forbidden.
- **CSV/formula injection**: all exports through `shared/security/csv.ts`.
- **Stored HTML** (offer-letter and email templates): sanitise on save; Gotenberg renders with JavaScript disabled
  and no network access (prevents SSRF from templates).
- Error responses never include stack traces or internal messages.

## 5. Public surfaces

| Endpoint                               | Controls                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Careers list / apply                   | rate limit, Cloudflare Turnstile, CV malware scan, no "already applied" disclosure                      |
| Offer response `/offer/respond/:token` | 256-bit token stored hashed, expires with the offer, single response, rate limit, view/download audited |
| SSO login/callback                     | strict rate limit, state + nonce + PKCE, same-site relative `returnTo` only                             |
| Health                                 | no versions or internals                                                                                |

## 6. HTTP hardening

helmet headers (CSP, HSTS, frame-ancestors), CORS limited to `APP_ORIGIN`, CSRF origin check on every
non-GET request, global rate limit (stricter on auth), Swagger disabled in production, `x-powered-by` off,
`trust proxy` set to the exact number of proxies.

## 7. Audit and monitoring

- `audit_logs` is **append-only at the database level** (trigger rejects UPDATE/DELETE).
- Audited: sign-in/out/failures, every data change (field-level before/after), permission and role changes,
  exports, reveals of sensitive fields, views of salary/identity records.
- Alerts (Application Insights): spikes of 401/403 per user, bulk exports, permission changes, sign-ins from
  new countries (Entra), 5xx rate.

## 8. Infrastructure

Private networking for Postgres, Blob and Key Vault; App Service accepts traffic only from Front Door;
Managed Identity everywhere (no connection-string secrets); separate DB roles for the app (DML only) and for
migrations (DDL, CI only); secrets per environment; least-privilege Azure RBAC with MFA.

## 9. Development process

- CI: gitleaks (secrets), dependency audit, CodeQL/Semgrep, OpenAPI drift, route-guard test, architecture rules.
- Claude Code: `.claude/settings.json` denies reading `.env*` and key files and blocks destructive commands.
- Run `/security-check` on every PR touching auth, permissions, files, exports, public endpoints or sensitive fields.
- Each module doc has a **Threat model** section.
- External penetration test before go-live, then yearly.

## Checklist for a new endpoint

- [ ] Access decorator chosen deliberately; `@Public` justified in a comment
- [ ] Record-level rule enforced in the service and covered by a 403/404 test
- [ ] Repository query filters by scope
- [ ] DTO validates every field; no privilege-bearing fields
- [ ] Response class lists fields explicitly; sensitive fields masked
- [ ] Audit row in the same transaction; no plain sensitive values in it
- [ ] Rate limit considered (public, auth, export, upload)
