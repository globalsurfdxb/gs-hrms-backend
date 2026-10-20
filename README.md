# GS HRMS — Backend

API for GS HRMS (Global Surf IT · Dubai and Kochi). NestJS 12 modular monolith on PostgreSQL, hosted on Azure.
The frontend lives in the separate `gs-hrms` repository.

## Quick start

Requirements: Node 24 (`nvm use`), Docker Desktop.

```bash
npm install                      # also generates the Prisma client
cp .env.example .env             # then fill the three keys:
openssl rand -base64 48          #   → SESSION_COOKIE_SECRET
openssl rand -base64 32          #   → FIELD_ENCRYPTION_KEY
openssl rand -base64 32          #   → FIELD_BLIND_INDEX_KEY
npm run db:up                    # Postgres, Azurite (Blob), Mailpit (email), Gotenberg (PDF)
npm run db:migrate               # create tables
npm run db:seed                  # fictional personas
npm run dev                      # same as start:dev
```

- API: http://localhost:3001/api
- Swagger UI: http://localhost:3001/api/docs (not available in production)
- Mailpit (caught emails): http://localhost:8025
- Saved API requests: open the `bruno/` folder in the [Bruno](https://www.usebruno.com) app — see [docs/api-guide.md](docs/api-guide.md)

### Signing in locally

Microsoft SSO is not needed for development. Sign in as a seeded persona:

```bash
curl -i -X POST http://localhost:3001/api/auth/dev/login \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"employeeCode":"GS-120"}'
```

| Code   | Role         |
| ------ | ------------ |
| GS-120 | Super Admin  |
| GS-119 | HR           |
| GS-101 | Office Admin |
| GS-058 | Team Lead    |
| GS-087 | Employee     |

`GET /api/auth/dev/personas` lists them for a frontend persona picker. When the Entra app registration exists,
fill the `ENTRA_*` settings and `GET /api/auth/login` starts Microsoft sign-in.

## Before you push

```bash
npm run check   # prettier, oxlint, architecture rules, typecheck, unit tests, e2e tests
```

## Documentation

| Doc                                                          | What it covers                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                           | Setup, daily git workflow, troubleshooting                           |
| [CLAUDE.md](CLAUDE.md)                                       | The rules — for developers and for Claude Code                       |
| [docs/architecture.md](docs/architecture.md)                 | Modular monolith, layers, module map, request pipeline               |
| [docs/conventions.md](docs/conventions.md)                   | Code, API, database and testing conventions                          |
| [docs/security.md](docs/security.md)                         | Security model and checklist                                         |
| [docs/api-guide.md](docs/api-guide.md)                       | How to read and test the API (Swagger UI, Bruno)                     |
| [flow/](flow/)                                               | Flow diagrams (PDF) of every module, in plain language               |
| [docs/frontend-integration.md](docs/frontend-integration.md) | How the Next.js app calls the API                                    |
| [docs/roadmap.md](docs/roadmap.md)                           | Phases, Phase 0 backlog, open decisions                              |
| [docs/modules/](docs/modules/)                               | Per-module spec: entities, state machines, business rules, endpoints |
| [docs/adr/](docs/adr/)                                       | Architecture decision records                                        |
| [docs/api/openapi.json](docs/api/openapi.json)               | Generated API contract                                               |
| [infra/](infra/)                                             | Azure deployment plan                                                |

## Working with Claude Code

The repo ships shared Claude Code configuration in `.claude/`: project settings and hooks, team skills
(`/new-module`, `/new-endpoint`, `/frontend-to-api`, `/db-migration`, `/security-check`, `/module-docs`, `/pr-ready`)
and a `convention-reviewer` subagent. Every developer gets the same setup by cloning the repo.
