## What and why

<!-- One paragraph. Link the module spec (docs/modules/...) and any BR ids implemented. -->

## Checklist

- [ ] `npm run check` passes locally
- [ ] Every new route has an access decorator; record-level rules have a 403/404 e2e test per excluded role
- [ ] Repository queries are scoped; responses are explicit `*Response` classes; sensitive fields masked/encrypted
- [ ] Mutations audited in the same transaction
- [ ] Swagger: every route has `@ApiOperation`, a typed success response and `@ApiErrors`
- [ ] Bruno request added/updated in `bruno/<module>/`
- [ ] `docs/api/openapi.json` regenerated (breaking changes listed below)
- [ ] Flow PDF updated (`flow/src/<module>.html` + `npm run flow:pdf`) if a business flow changed
- [ ] `docs/modules/<spec>.md` updated (endpoints, rules, state diagram)
- [ ] Migration reviewed — no destructive change without approval
- [ ] `/security-check` run (required for auth, permissions, personal data, files, exports, money, public routes)

## Breaking changes for the frontend

<!-- None, or list removed/renamed fields and paths. -->
