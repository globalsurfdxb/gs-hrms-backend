import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthUser, HrmsRequest } from './auth-user.js';

/** Injects the signed-in user. Only valid on @SignedIn / @RequirePermission routes. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<HrmsRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});
