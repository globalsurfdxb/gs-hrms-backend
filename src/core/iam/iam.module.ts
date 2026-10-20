import { Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';

/* Access control. Phase 0 backlog: roles & permissions API (the frontend's Roles & Permissions screen),
   ScopedRepository for data scopes, field-level response filtering. */
@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class IamModule {}
