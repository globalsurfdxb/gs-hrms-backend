import { Injectable } from '@nestjs/common';
import { actorOf } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import type { AssignRoleDto, CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from './api/role.dto.js';
import { RoleResponse, type AssignRoleResponse, type SetPermissionsResponse } from './api/role.response.js';
import {
  assertCanAssign,
  assertCanGrant,
  assertGrantsEditable,
  assertNotOwnRole,
  assertRoleDeletable,
  assertRoleRenamable,
  checkGrants,
  diffGrants,
  normaliseRoleName,
} from './role.rules.js';
import { keysOf, RolesRepository, type RoleRecord } from './roles.repository.js';

/* Roles & Permissions (Administration). Access is checked by the controller (administration:admin-roles); the rules
   here stop anyone changing their own access or handing out more than they hold. */
@Injectable()
export class RolesService {
  constructor(private readonly roles: RolesRepository) {}

  async list(): Promise<RoleResponse[]> {
    return (await this.roles.findAll()).map(RoleResponse.from);
  }

  async get(id: string): Promise<RoleResponse> {
    return RoleResponse.from(await this.found(id));
  }

  async create(dto: CreateRoleDto, user: AuthUser): Promise<RoleResponse> {
    const name = normaliseRoleName(dto.name);
    await this.checkNameFree(name);
    const permissions = checkGrants(dto.permissions ?? []);
    assertCanGrant(user.permissions, permissions);
    return RoleResponse.from(
      await this.roles.create({ name, description: dto.description?.trim() ?? '', permissions }, actorOf(user)),
    );
  }

  async update(id: string, dto: UpdateRoleDto, user: AuthUser): Promise<RoleResponse> {
    const role = await this.found(id);
    assertNotOwnRole(user.roleId, id);

    const changes: { name?: string; description?: string } = {};
    if (dto.name !== undefined) {
      const name = normaliseRoleName(dto.name);
      assertRoleRenamable(role, name);
      if (name !== role.name) {
        await this.checkNameFree(name, id);
        changes.name = name;
      }
    }
    if (dto.description !== undefined && dto.description.trim() !== role.description) {
      changes.description = dto.description.trim();
    }
    if (Object.keys(changes).length === 0) return RoleResponse.from(role);
    return RoleResponse.from(await this.roles.updateDetails(id, role, changes, actorOf(user)));
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto, user: AuthUser): Promise<SetPermissionsResponse> {
    const role = await this.found(id);
    assertNotOwnRole(user.roleId, id);
    assertGrantsEditable(role);
    const next = checkGrants(dto.permissions);

    let diff = { granted: [] as string[], revoked: [] as string[] };
    const { sessionsRevoked } = await this.roles.setPermissions(id, next, actorOf(user), (before) => {
      diff = diffGrants(before, next);
      assertCanGrant(user.permissions, diff.granted);
      return diff;
    });
    return { role: RoleResponse.from(await this.found(id)), ...diff, sessionsRevoked };
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const role = await this.found(id);
    assertNotOwnRole(user.roleId, id);
    await this.roles.delete(id, { name: role.name, permissions: keysOf(role) }, actorOf(user), (members) =>
      assertRoleDeletable(role, members),
    );
  }

  async assign(employeeId: string, dto: AssignRoleDto, user: AuthUser): Promise<AssignRoleResponse> {
    // BR-IAM-003: nobody changes their own role.
    if (employeeId === user.employeeId)
      throw forbidden('role.own_role', 'You cannot change your own role or its permissions');
    const employee = await this.roles.employee(employeeId);
    if (!employee) throw notFound('employee');
    const role = await this.found(dto.roleId);
    if (employee.role.id === role.id) return { employeeId, role: role.name, sessionsRevoked: 0 };

    assertCanAssign(user.permissions, keysOf(employee.role), keysOf(role));
    const result = await this.roles.assignRole(employeeId, employee.role, role, actorOf(user));
    if (!result.changed)
      throw conflict('role.changed_meanwhile', 'Their role was just changed by someone else. Reload and try again.');
    return { employeeId, role: role.name, sessionsRevoked: result.sessionsRevoked };
  }

  private async found(id: string): Promise<RoleRecord> {
    const role = await this.roles.findById(id);
    if (!role) throw notFound('role');
    return role;
  }

  private async checkNameFree(name: string, exceptId?: string) {
    if (await this.roles.nameTaken(name, exceptId))
      throw conflict('role.name_taken', `A role called "${name}" already exists`);
  }
}
