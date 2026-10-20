import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden } from '../../shared/errors/app-error.js';
import type { HrmsRequest } from '../auth/auth-user.js';
import { ACCESS_KEY, type AccessRule } from './access.decorators.js';
import { hasPermission } from './permission-catalog.js';

/* Deny by default. Runs after SessionGuard. A route without an access decorator is refused — forgetting the
   decorator can never open an endpoint. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) {
      this.logger.error(`Route ${ctx.getClass().name}.${ctx.getHandler().name} has no access rule — refused`);
      throw forbidden('auth.no_access_rule', 'This endpoint is not configured for access');
    }
    if (rule.kind === 'public') return true;

    const user = ctx.switchToHttp().getRequest<HrmsRequest>().user;
    if (!user) throw new UnauthorizedException();
    if (rule.kind === 'signed-in') return true;

    if (!hasPermission(user.permissions, rule.feature, rule.action)) throw forbidden();
    return true;
  }
}
