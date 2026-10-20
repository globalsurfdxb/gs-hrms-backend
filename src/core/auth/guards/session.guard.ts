import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import type { HrmsRequest } from '../auth-user.js';
import { sessionCookieName } from '../session/session-cookie.js';
import { SessionService } from '../session/session.service.js';

/* Attaches req.user when the session cookie is valid. It never rejects by itself — PermissionsGuard decides,
   so public routes still see who is signed in when there is a session. */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly cookie: string;

  constructor(
    private readonly sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    this.cookie = sessionCookieName({ NODE_ENV: config.get('NODE_ENV', { infer: true }) });
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<HrmsRequest>();
    const token: unknown = req.cookies?.[this.cookie];
    if (typeof token === 'string' && token.length > 0) {
      req.user = (await this.sessions.resolve(token)) ?? undefined;
    }
    return true;
  }
}
