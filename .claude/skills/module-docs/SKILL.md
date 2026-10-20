---
name: module-docs
description: Bring docs/modules/<spec>.md, docs/architecture.md and the module CLAUDE.md back in sync with the code — entities, state diagrams, business rules with test references, access table and endpoint list. Use after finishing a feature or when docs look stale.
---

# Module docs sync

1. Read the module's code: `prisma/schema/<module>.prisma`, `domain/` (rules, transition tables), controllers
   (routes + access decorators), e2e tests, and `docs/api/openapi.json` for the module's paths.
2. Update `docs/modules/<spec>.md`:
   - Status line and phase
   - Mermaid `erDiagram` from the Prisma models; `stateDiagram-v2` from the transition tables
   - Business rules table: every `BR-…` id found in code comments/tests, where enforced, which test covers it.
     Flag rules in the doc with no code or test.
   - Access table from the decorators and service checks
   - Endpoint table from the controllers (method, path, access) — no request/response detail (Swagger has it)
3. Update `docs/modules/README.md` status and the module map in `docs/architecture.md` if changed.
4. Update the module `CLAUDE.md` if new pitfalls or rules appeared.
5. Show the doc diff summary. Do not change code in this skill.
