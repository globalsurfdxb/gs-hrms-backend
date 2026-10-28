/* Permission keys. These MUST stay identical to the frontend catalogue (gs-hrms lib/access.ts) so the
   Roles & Permissions screen and the API agree:
     - a feature id grants View, e.g.        'administration:admin-companies'
     - `<id>#add|edit|delete` grants the rest, e.g. 'administration:admin-companies#add'
   The full catalogue (every module, including ones the backend has not built yet) lives in feature-catalog.ts.
   PERMISSIONS below names the features the backend's routes check; add a module's features here when you build
   it (skill: new-endpoint). Pure file — no Nest imports, because the seed script uses it too. */

import { CATALOG, catalogDefaultGrants, SYSTEM_ROLES, type SystemRole } from './feature-catalog.js';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete';
export const EXTRA_ACTIONS = ['add', 'edit', 'delete'] as const satisfies readonly PermissionAction[];

export const PERMISSIONS = {
  administration: {
    companies: 'administration:admin-companies',
    structure: 'administration:admin-structure',
    roles: 'administration:admin-roles',
    workflow: 'administration:admin-workflow',
    notifications: 'administration:admin-notif',
    reminders: 'administration:admin-reminders',
    audit: 'administration:admin-audit',
    /** System Settings — includes location management. */
    settings: 'administration:admin-settings',
  },
  hiring: {
    requisitions: 'hiring:requisitions:requisitions',
    requisitionApprovals: 'hiring:requisitions:requisition-approvals',
    jobs: 'hiring:recruiting:jobs',
    candidates: 'hiring:recruiting:candidates',
    interviews: 'hiring:recruiting:interviews',
    offers: 'hiring:recruiting:offers',
    reports: 'hiring:reports:hiring-reports',
  },
} as const;

type Leaves<T> = T extends string ? T : { [K in keyof T]: Leaves<T[K]> }[keyof T];
export type PermissionFeature = Leaves<typeof PERMISSIONS>;

export const permKey = (feature: string, action: PermissionAction) =>
  action === 'view' ? feature : `${feature}#${action}`;

/** Same rule as the frontend `can()`: Add/Edit/Delete also require View. */
export const hasPermission = (granted: ReadonlySet<string>, feature: string, action: PermissionAction = 'view') =>
  granted.has(feature) && (action === 'view' || granted.has(permKey(feature, action)));

/** Every feature id in the catalogue. */
export const allFeatures = (): string[] =>
  CATALOG.flatMap((m) => m.categories.flatMap((c) => c.features.map((f) => f.id)));

const isSystemRole = (role: string): role is SystemRole => (SYSTEM_ROLES as string[]).includes(role);

/** Starting grants for the built-in roles (mirrors the frontend `defaultGrants`). Used by the seed only;
    after that, Super Admin manages grants through the Roles & Permissions screen. A custom role starts empty. */
export function defaultGrants(role: string): string[] {
  return isSystemRole(role) ? catalogDefaultGrants(role) : [];
}
