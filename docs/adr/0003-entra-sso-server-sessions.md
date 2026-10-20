# 0003. Microsoft Entra SSO with server-side sessions

- Status: Accepted
- Date: 2026-10-19

## Context

The company runs on Microsoft 365 and every employee has an account. The frontend prototype has no real
authentication. Security is a top requirement.

## Decision

- Production sign-in is Entra ID only (single tenant, auth-code + PKCE via MSAL Node). No local passwords.
- The backend keeps Microsoft tokens server-side and issues its own opaque session cookie
  (`__Host-hrms_sid`, httpOnly, Secure, SameSite=Lax); sessions live in Postgres (hash only) for instant revocation.
- Accounts are keyed by Entra `oid`; roles and permissions live in the HRMS database.
- A dev-only persona login allows development and tests without Entra; it cannot run in production.

## Consequences

- MFA, conditional access and account lifecycle come from M365.
- APIs never change when SSO is switched on — only the sign-in entry point differs.
- Requires the M365 admin to create the app registration before staging.
