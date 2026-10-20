/* Permission keys. These MUST stay identical to the frontend catalogue (gs-hrms lib/access.ts) so the
   Roles & Permissions screen and the API agree:
     - a feature id grants View, e.g.        'administration:admin-companies'
     - `<id>#add|edit|delete` grants the rest, e.g. 'administration:admin-companies#add'
   Add a module's features here when you build that module (skill: new-endpoint). Pure file — no Nest imports,
   because the seed script uses it too. */

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
} as const;

type Leaves<T> = T extends string ? T : { [K in keyof T]: Leaves<T[K]> }[keyof T];
export type PermissionFeature = Leaves<typeof PERMISSIONS>;

export const permKey = (feature: string, action: PermissionAction) =>
  action === 'view' ? feature : `${feature}#${action}`;

/** Same rule as the frontend `can()`: Add/Edit/Delete also require View. */
export const hasPermission = (granted: ReadonlySet<string>, feature: string, action: PermissionAction = 'view') =>
  granted.has(feature) && (action === 'view' || granted.has(permKey(feature, action)));

export const allFeatures = (): string[] =>
  Object.values(PERMISSIONS).flatMap((group) => Object.values(group) as string[]);

/** Starting grants for the built-in roles (mirrors the frontend `defaultGrants`). Used by the seed only;
    after that, Super Admin manages grants through the Roles & Permissions screen. */
export function defaultGrants(role: string): string[] {
  const admin = allFeatures().filter((f) => f.startsWith('administration:'));
  const grant = (features: string[], actions: readonly PermissionAction[]) =>
    features.flatMap((f) => [f, ...actions.filter((a) => a !== 'view').map((a) => permKey(f, a))]);

  switch (role) {
    case 'Super Admin':
      return grant(allFeatures(), EXTRA_ACTIONS);
    case 'HR':
    case 'Office Admin':
      // Administration without Delete, as in the frontend defaults.
      return grant(admin, ['add', 'edit']);
    default:
      return [];
  }
}
