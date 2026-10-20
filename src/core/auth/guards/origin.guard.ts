import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import { forbidden } from '../../../shared/errors/app-error.js';
import type { HrmsRequest } from '../auth-user.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/* CSRF protection. Sessions are cookies, so a state-changing request must prove it came from the HRMS frontend:
   its Origin (or, failing that, Referer) must match APP_ORIGIN. Combined with SameSite=Lax cookies this blocks
   cross-site form posts and fetches. */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: string[];

  constructor(config: ConfigService<Env, true>) {
    const appOrigin = new URL(config.get('APP_ORIGIN', { infer: true })).origin;
    // Locally, also allow Swagger UI served by the API itself.
    this.allowed =
      config.get('NODE_ENV', { infer: true }) === 'production'
        ? [appOrigin]
        : [appOrigin, `http://localhost:${config.get('PORT', { infer: true })}`];
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<HrmsRequest>();
    if (SAFE.has(req.method)) return true;

    const origin = req.headers.origin ?? originOf(req.headers.referer);
    if (origin && this.allowed.includes(origin)) return true;
    throw forbidden('request.bad_origin', 'Request origin not allowed');
  }
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
