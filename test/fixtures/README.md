# Test fixtures

## `frontend-permissions.json`

A snapshot of the frontend permission catalogue (`gs-hrms` `lib/access.ts`): every feature id and the default
grants of the five built-in roles. `src/core/iam/permission-catalog.spec.ts` checks that the backend catalogue
(`src/core/iam/feature-catalog.ts`) produces exactly the same keys, so `/api/auth/me` returns the permissions
the frontend expects.

When the frontend catalogue changes:

1. Port the change to `src/core/iam/feature-catalog.ts`.
2. Refresh the snapshot. Save this as `dump.ts` **outside both repos** (e.g. a temp folder):

   ```ts
   import { buildCatalog, defaultGrants, SYSTEM_ROLES } from '@/lib/access';
   const catalog = buildCatalog();
   const out = {
     features: catalog.flatMap((m) => m.categories.flatMap((c) => c.features.map((f) => f.id))),
     grants: Object.fromEntries(SYSTEM_ROLES.map((r) => [r, [...defaultGrants(r, catalog)].sort()])),
   };
   console.log(JSON.stringify(out));
   ```

   Run it from the frontend folder with the backend's `tsx`, then format it into this file (features sorted, keep
   the `source` line):

   ```bash
   cd ../gs-hrms
   ../gs-hrms-backend/node_modules/.bin/tsx /path/to/dump.ts > /path/to/frontend.json
   ```

3. `npm test` must pass, then `npm run db:seed` to apply the new default grants locally.
