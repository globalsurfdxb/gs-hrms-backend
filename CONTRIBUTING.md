# Contributing

How to set up the backend on your machine and how we ship changes. Read [CLAUDE.md](CLAUDE.md) for the code
rules and [docs/](docs/) for the module specs before you start on a feature.

## 1. One-time setup

**You need:** Node 24 (`node -v` shows `v24.x`), Docker Desktop, Git. About 4 GB free disk for Docker images.

```bash
git clone <repo-url> hrms-backend
cd hrms-backend
npm ci                          # installs packages, generates the Prisma client, installs git hooks

cp .env.example .env            # your own copy — never share or commit it
openssl rand -base64 48         # → SESSION_COOKIE_SECRET
openssl rand -base64 32         # → FIELD_ENCRYPTION_KEY
openssl rand -base64 32         # → FIELD_BLIND_INDEX_KEY
```

Open Docker Desktop, then:

```bash
npm run db:up                   # Postgres, Azurite, Mailpit, Gotenberg
npm run db:migrate              # create tables
npm run db:seed                 # fictional personas
npm run check                   # everything should pass
```

### PostgreSQL already installed on your machine?

Both want port 5432. Either stop your local PostgreSQL while you work here, or move this project's Postgres to
port 5433 with a personal `docker-compose.override.yml` (git-ignored):

```yaml
services:
  postgres:
    ports: !override
      - '127.0.0.1:5433:5432'
```

and change the port in `DATABASE_URL` in your `.env` to `5433`.

## 2. Run the app

```bash
npm run dev
```

- API: http://localhost:3001/api
- Swagger UI: http://localhost:3001/api/docs
- Emails: http://localhost:8025

Sign in as a seeded persona (no Microsoft account needed): `GS-120` Super Admin, `GS-119` HR, `GS-101` Office
Admin, `GS-058` Team Lead, `GS-087` Employee. Use Swagger, the Bruno collection in `bruno/`, or
`POST /api/auth/dev/login` — see [README.md](README.md).

## 3. Daily workflow

```bash
# Start of day
git checkout main
git pull origin main
npm ci                          # only if package-lock.json changed
npm run db:migrate              # only if new migrations came in

# Save work — hooks format, lint and check the message automatically
git add .
git commit -m "feat(org): add departments API"

# Before pushing
git pull --rebase origin main
npm run check                   # Docker must be running (e2e tests)
git push origin main:<your-name>
```

Then on GitHub: open a PR from `<your-name>` → `main`, fill in the template, wait for CI to pass, get a review
and merge with **Create a merge commit**. After merging, delete the branch on GitHub and run
`git pull origin main`.

### Also run, when you changed…

| Changed                                       | Run                                                                |
| --------------------------------------------- | ------------------------------------------------------------------ |
| An endpoint or DTO                            | `npm run openapi:export` and commit `docs/api/openapi.json`        |
| The database schema                           | `npm run db:migrate -- --name <what>` and review the generated SQL |
| A business flow                               | edit `flow/src/<module>.html`, then `npm run flow:pdf`             |
| Auth, permissions, PII, money, files, exports | run `/security-check` in Claude Code                               |

## 4. Commit messages

[Conventional Commits](https://www.conventionalcommits.org) — enforced by commitlint:

```
feat(org): add departments API
fix(auth): reject expired sessions
docs(leave): update approval flow
chore: bump dependencies
```

## 5. Rules

- Push only to your own branch (`main:<your-name>`). Never `git push origin main`.
- Never commit `.env`, keys or real employee data. Check `git status` before every commit.
- Don't skip hooks with `--no-verify`, and don't weaken lint rules, tests or `.dependency-cruiser.cjs` to pass.
- If `git push origin main:<your-name>` is rejected after a merge, the old branch still exists on GitHub —
  delete it there and push again.

## Troubleshooting

| Problem                               | Fix                                                             |
| ------------------------------------- | --------------------------------------------------------------- |
| e2e tests fail with `ECONNREFUSED`    | Docker Desktop isn't running — open it, then `npm run db:up`    |
| `db:migrate` can't reach the database | Postgres is still starting — wait a few seconds and retry       |
| `port is already allocated`           | Another app uses the port — stop it, or use the override above  |
| Strange errors after `git pull`       | `npm ci` then `npm run db:migrate`                              |
| Commit rejected                       | Read the hook output — fix the lint error or the message format |
