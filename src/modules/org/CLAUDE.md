# Org module — reference implementation

Spec: `docs/modules/org.md`. Frontend sources: `context/OrgContext.tsx`, `app/admin/companies`,
`app/admin/structure`, `app/admin/settings`.

This module is the pattern every other module copies. Keep it clean and idiomatic: if you improve a
convention here, update `docs/conventions.md` and the skills in the same change.

## Rules specific to this module

- Reads (`GET`) are `@SignedIn` — every form needs companies/departments/designations/locations.
- Writes use `administration:admin-companies` / `admin-structure` / `admin-settings` permissions.
- Audit module name: `Organization`.
- Business rules BR-ORG-001… live in `domain/` with unit tests named after the id.

## Do not

- Delete a location that is `system` or in use (BR-ORG-004).
- Hard-delete a company or department referenced by employees — deactivate instead (BR-ORG-005).
