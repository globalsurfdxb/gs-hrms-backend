import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionFeature } from './permission-catalog.js';

/* Every route MUST carry exactly one of these. A route with none is rejected at runtime by PermissionsGuard and
   fails the route-guard test in CI (test/security/route-guards.e2e-spec.ts).

     @Public()                                  — no sign-in (careers page, offer response, health, SSO callback)
     @SignedIn()                                — any signed-in person (self-service: /me, my leave, my payslips)
     @RequirePermission(feature, action?)       — a role grant from the permission catalogue

   Record-level rules (team lead → direct reports only, nobody approves their own request) are NOT expressed here;
   they live in the module's domain policies and scoped repositories. */

export const ACCESS_KEY = 'hrms:access';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'permission'; feature: PermissionFeature; action: PermissionAction };

export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessRule);
export const SignedIn = () => SetMetadata(ACCESS_KEY, { kind: 'signed-in' } satisfies AccessRule);
export const RequirePermission = (feature: PermissionFeature, action: PermissionAction = 'view') =>
  SetMetadata(ACCESS_KEY, { kind: 'permission', feature, action } satisfies AccessRule);
