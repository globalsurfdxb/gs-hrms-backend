import { Module } from '@nestjs/common';
import { RolesController } from './api/roles.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RolesRepository } from './roles.repository.js';
import { RolesService } from './roles.service.js';

/* Access control: the deny-by-default guard and the roles & permissions API (Administration → Roles & Permissions).
   Phase 0 backlog: ScopedRepository for data scopes, custom features, field-level response filtering. */
@Module({
  controllers: [RolesController],
  providers: [PermissionsGuard, RolesService, RolesRepository],
  exports: [PermissionsGuard],
})
export class IamModule {}
