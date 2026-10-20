# Infrastructure (Azure)

Bicep templates for staging and production go in this folder (Phase 0 backlog). Nothing is configured by hand
in the portal: every environment is created from these files. Decision: [ADR-0006](../docs/adr/0006-azure-hosting.md).

## Target topology (per environment)

| Resource                             | SKU / setting (starting point)                                                         | Notes                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Resource group                       | `rg-hrms-<env>-uaenorth`                                                               | Separate subscription for production preferred                                                  |
| Virtual network                      | subnets: app (App Service integration), data (private endpoints)                       |                                                                                                 |
| App Service plan                     | Linux, P1v3                                                                            | Hosts frontend + backend apps; deployment slots for zero-downtime                               |
| App Service `app-hrms-api-<env>`     | container from ACR, VNet integrated, system-assigned Managed Identity                  | Health check `/api/health/ready`; Gotenberg sidecar; access restricted to Front Door            |
| App Service `app-hrms-web-<env>`     | Next.js container                                                                      | Access restricted to Front Door                                                                 |
| PostgreSQL Flexible Server           | General Purpose D2ds_v5 (Burstable B2s for staging), PG 16, private access, Entra auth | Backups 35 days, zone-redundant HA if budget allows                                             |
| Storage account                      | Blob, private endpoint, public access disabled, soft delete + versioning               | Defender for Storage malware scanning on upload                                                 |
| Key Vault                            | RBAC mode, purge protection, private endpoint                                          | `FIELD_ENCRYPTION_KEY`, `FIELD_BLIND_INDEX_KEY`, `SESSION_COOKIE_SECRET`, `ENTRA_CLIENT_SECRET` |
| Front Door                           | Premium (managed WAF rules) or Standard + custom rules — decide on cost                | `hrms.gs-it.ae`: `/api/*` → api, `/*` → web                                                     |
| Container Registry                   | Basic                                                                                  | Images for api and web                                                                          |
| Application Insights + Log Analytics |                                                                                        | Alerts: 5xx rate, 401/403 spikes, bulk exports                                                  |
| Defender for Cloud                   | Servers/App Service/Storage/Databases plans as budget allows                           |                                                                                                 |

Verify every service is available in UAE North when provisioning.

## App settings (backend)

`NODE_ENV=production`, `TRUST_PROXY_HOPS=2`, `APP_ORIGIN=https://hrms.gs-it.ae`,
`ENTRA_REDIRECT_URI=https://hrms.gs-it.ae/api/auth/callback`, `AZURE_STORAGE_ACCOUNT_URL=…`,
`DATABASE_URL` (Entra token auth for the app's managed identity), secrets as Key Vault references:
`@Microsoft.KeyVault(SecretUri=…)`. `AUTH_DEV_LOGIN` must be absent or `false` (the app refuses to boot otherwise).

## Database roles

- `hrms_app` (managed identity): SELECT/INSERT/UPDATE/DELETE on application tables; no DDL.
- `hrms_migrator` (CI only): DDL for `prisma migrate deploy`.

## Deployment (GitHub Actions)

OIDC federated credential → `az login` without stored secrets → build image → push to ACR → run
`prisma migrate deploy` as `hrms_migrator` → deploy to staging slot → smoke test `/api/health/ready` → swap.
