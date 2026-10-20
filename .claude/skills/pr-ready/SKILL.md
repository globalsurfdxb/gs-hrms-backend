---
name: pr-ready
description: Prepare the current branch for a pull request — run all checks, regenerate the OpenAPI contract, verify docs and tests, and draft the PR description from the template. Use when a feature is finished. Never commits or pushes without the developer's explicit approval.
---

# PR ready

1. `npm run check` — fix failures (do not weaken lint rules, tests or `.dependency-cruiser.cjs`).
2. `npm run openapi:export`; if `docs/api/openapi.json` changed, it belongs in this PR. Call out breaking changes
   (removed/renamed fields or paths, new required fields) for the frontend.
3. Verify for each new endpoint: e2e happy path + forbidden-role test exist; module doc row exists.
4. If the change touches auth, permissions, personal data, files, exports, money or public routes → run the
   `security-check` skill and include its summary.
5. If there is a migration → confirm it was reviewed per the `db-migration` skill (no destructive change without approval).
6. Draft the PR description using `.github/pull_request_template.md`, with a Conventional Commit style title
   (`feat(org): add departments API`).
7. Show the proposed commit message and PR text. **Ask before running `git commit` or `git push`** — every time.
