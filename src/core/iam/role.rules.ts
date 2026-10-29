import { AppError, conflict, forbidden } from '../../shared/errors/app-error.js';
import { CATALOG } from './feature-catalog.js';

/* Pure rules for roles and grants — no Nest, no Prisma. Unit-tested in role.rules.spec.ts.
   Rule ids refer to docs/modules/platform.md (IAM). The anti-escalation rules (BR-IAM-004, BR-IAM-006) matter
   because Roles → Edit is held by HR and Office Admin by default, not only by Super Admin. */

export const SUPER_ADMIN = 'Super Admin';

/** Actions beyond View each feature allows, by feature id. */
const ACTIONS = new Map<string, readonly string[]>(
  CATALOG.flatMap((m) => m.categories.flatMap((c) => c.features.map((f) => [f.id, f.actions] as const))),
);

/** BR-IAM-001: role names are 2–60 characters, trimmed. Uniqueness (ignoring case) is checked by the service. */
export function normaliseRoleName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) throw new AppError('role.invalid_name', 'Role name must be 2–60 characters');
  return name;
}

/** BR-IAM-002: every key exists in the catalogue (`<feature>` or `<feature>#add|edit|delete` where the feature allows
    that action) and Add/Edit/Delete come with View, as in the frontend `can()`. Returns the keys sorted, without
    duplicates. */
export function checkGrants(keys: readonly string[]): string[] {
  const unique = [...new Set(keys)].sort();
  const unknown = unique.filter((k) => {
    const [feature, action, extra] = k.split('#');
    const allowed = ACTIONS.get(feature);
    return !allowed || extra !== undefined || (action !== undefined && !allowed.includes(action));
  });
  if (unknown.length > 0) {
    throw new AppError('role.unknown_permission', `Unknown permission ${unknown.slice(0, 5).join(', ')}`, 400, {
      unknown,
    });
  }
  const granted = new Set(unique);
  const withoutView = unique.filter((k) => k.includes('#') && !granted.has(k.split('#')[0]));
  if (withoutView.length > 0) {
    throw new AppError('role.permission_without_view', 'Add, Edit and Delete also need View', 400, { withoutView });
  }
  return unique;
}

export function diffGrants(before: readonly string[], after: readonly string[]) {
  const was = new Set(before);
  const now = new Set(after);
  return { granted: after.filter((k) => !was.has(k)), revoked: before.filter((k) => !now.has(k)) };
}

/** BR-IAM-003: nobody changes the grants of their own role, or their own role. */
export function assertNotOwnRole(callerRoleId: string, roleId: string): void {
  if (callerRoleId === roleId) throw forbidden('role.own_role', 'You cannot change your own role or its permissions');
}

/** BR-IAM-004: you can only grant permissions you hold yourself. */
export function assertCanGrant(callerPermissions: ReadonlySet<string>, granted: readonly string[]): void {
  const missing = granted.filter((k) => !callerPermissions.has(k));
  if (missing.length > 0) {
    throw new AppError('role.grant_exceeds_own', 'You can only grant permissions you have yourself', 403, { missing });
  }
}

/** BR-IAM-005: the Super Admin role always has the full catalogue; its permissions cannot be changed. */
export function assertGrantsEditable(role: { name: string; system: boolean }): void {
  if (role.system && role.name === SUPER_ADMIN) {
    throw conflict('role.super_admin_fixed', 'The Super Admin role always has every permission');
  }
}

/** BR-IAM-006: you can only move someone between roles that give no more than you have — both the role they
    have now and the one they get. */
export function assertCanAssign(
  callerPermissions: ReadonlySet<string>,
  currentRoleKeys: readonly string[],
  newRoleKeys: readonly string[],
): void {
  const missing = [...new Set([...currentRoleKeys, ...newRoleKeys])].filter((k) => !callerPermissions.has(k));
  if (missing.length > 0) {
    throw new AppError(
      'role.assign_exceeds_own',
      'You can only assign roles whose permissions you have yourself, to people whose role does not exceed yours',
      403,
      { missing },
    );
  }
}

/** BR-IAM-007: system roles are never renamed or deleted; a role still held by someone cannot be deleted. */
export function assertRoleRenamable(role: { system: boolean; name: string }, name: string): void {
  if (role.system && role.name !== name) throw conflict('role.system', 'System roles cannot be renamed');
}

export function assertRoleDeletable(role: { system: boolean }, members: number): void {
  if (role.system) throw conflict('role.system', 'System roles cannot be deleted');
  if (members > 0) {
    throw new AppError('role.in_use', `${members} employee(s) have this role. Give them another role first.`, 409, {
      members,
    });
  }
}
