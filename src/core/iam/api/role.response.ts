import { ApiProperty } from '@nestjs/swagger';
import { CATALOG } from '../feature-catalog.js';
import { keysOf, type RoleRecord } from '../roles.repository.js';

/* Explicit response shapes. Never return Prisma records directly. */

export class RoleResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'HR' }) name: string;
  @ApiProperty({ example: 'All employees, all locations' }) description: string;
  @ApiProperty({ description: 'System roles cannot be renamed or deleted' }) system: boolean;
  @ApiProperty({ type: [String], description: 'Granted permission keys, sorted' }) permissions: string[];
  @ApiProperty({ example: 3, description: 'Employees who have this role' }) memberCount: number;
  @ApiProperty() updatedAt: string;

  static from(this: void, r: RoleRecord): RoleResponse {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      system: r.system,
      permissions: keysOf(r),
      memberCount: r._count.employees,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

export class SetPermissionsResponse {
  @ApiProperty({ type: RoleResponse }) role: RoleResponse;
  @ApiProperty({ type: [String] }) granted: string[];
  @ApiProperty({ type: [String] }) revoked: string[];
  @ApiProperty({ example: 4, description: 'Sessions of the role’s members that were ended (they sign in again)' })
  sessionsRevoked: number;
}

export class AssignRoleResponse {
  @ApiProperty() employeeId: string;
  @ApiProperty({ example: 'Team Lead' }) role: string;
  @ApiProperty({ example: 1 }) sessionsRevoked: number;
}

class CatalogFeatureResponse {
  @ApiProperty({ example: 'administration:admin-companies' }) id: string;
  @ApiProperty({ example: 'Companies' }) label: string;
  @ApiProperty({
    enum: ['add', 'edit', 'delete'],
    isArray: true,
    description: 'Empty = a read-only screen (View only)',
  })
  actions: string[];
}

class CatalogCategoryResponse {
  @ApiProperty({ example: 'admin-organization' }) id: string;
  @ApiProperty({ example: 'Organization' }) label: string;
  @ApiProperty({
    example: 5,
    description: 'Lowest built-in role rank given it by default (1 Employee … 5 Super Admin)',
  })
  rank: number;
  @ApiProperty({ type: [CatalogFeatureResponse] }) features: CatalogFeatureResponse[];
}

export class CatalogModuleResponse {
  @ApiProperty({ example: 'administration' }) id: string;
  @ApiProperty({ example: 'Administration' }) name: string;
  @ApiProperty({ type: [CatalogCategoryResponse] }) categories: CatalogCategoryResponse[];

  static all(): CatalogModuleResponse[] {
    return CATALOG.map((m) => ({
      id: m.id,
      name: m.name,
      categories: m.categories.map((c) => ({
        id: c.id,
        label: c.label,
        rank: c.rank,
        features: c.features.map((f) => ({ id: f.id, label: f.label, actions: [...f.actions] })),
      })),
    }));
  }
}
