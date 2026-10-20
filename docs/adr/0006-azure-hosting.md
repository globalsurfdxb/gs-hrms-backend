# 0006. Azure (UAE North) for all hosting

- Status: Accepted
- Date: 2026-10-19

## Context

The company uses Microsoft 365/Entra. Data includes UAE and Indian identity documents.

## Decision

App Service (Linux containers) for frontend and backend on one plan; PostgreSQL Flexible Server (private access);
Blob Storage (private endpoint, Defender malware scanning); Key Vault; Front Door + WAF; Application Insights;
Managed Identity everywhere; Bicep for infrastructure; GitHub Actions with OIDC. Region UAE North
(verify service availability when provisioning).

## Consequences

No stored credentials between services; single identity plane with M365. Local development uses Docker
equivalents (Postgres, Azurite, Mailpit, Gotenberg).
