import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { Env } from '../../config/env.js';
import { ApiErrors } from '../http/api-docs.js';
import { Public, SignedIn } from '../iam/access.decorators.js';
import type { AuthUser, HrmsRequest } from './auth-user.js';
import { DevLoginDto, DevPasswordLoginDto, DevPersonaResponse, MeResponse } from './auth.dto.js';
import { AuthService, type RequestMeta } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { EntraProvider, type SsoTransaction } from './providers/entra.provider.js';
import {
  AUTH_TX_COOKIE,
  authTxCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './session/session-cookie.js';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

/** Only same-site relative paths — never an open redirect. */
const safeReturnTo = (v: unknown) =>
  typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/dashboard';

const metaOf = (req: HrmsRequest): RequestMeta => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly entra: EntraProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get env() {
    return {
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
      SESSION_ABSOLUTE_HOURS: this.config.get('SESSION_ABSOLUTE_HOURS', { infer: true }),
    };
  }

  private get appOrigin() {
    return new URL(this.config.get('APP_ORIGIN', { infer: true })).origin;
  }

  private setSession(res: Response, token: string) {
    res.cookie(sessionCookieName(this.env), token, sessionCookieOptions(this.env));
  }

  /** Starts Microsoft sign-in. The frontend links the "Continue with Microsoft" button here. */
  @Public()
  @Throttle(STRICT)
  @Get('login')
  @ApiExcludeEndpoint()
  async login(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    const { url, tx } = await this.entra.begin(safeReturnTo(returnTo));
    res.cookie(AUTH_TX_COOKIE, JSON.stringify(tx), authTxCookieOptions(this.env));
    res.redirect(url);
  }

  /** Microsoft redirects back here. Registered as the Redirect URI in Entra. */
  @Public()
  @Throttle(STRICT)
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: HrmsRequest,
    @Res() res: Response,
  ) {
    const raw: unknown = req.signedCookies?.[AUTH_TX_COOKIE];
    res.clearCookie(AUTH_TX_COOKIE, { ...authTxCookieOptions(this.env), maxAge: undefined });
    const fail = (reason: string) => res.redirect(`${this.appOrigin}/login?error=${reason}`);

    let tx: SsoTransaction;
    try {
      tx = JSON.parse(String(raw)) as SsoTransaction;
    } catch {
      return fail('sso_expired');
    }
    if (!code || !state || state !== tx.state) return fail('sso_failed');

    try {
      const identity = await this.entra.complete(code, tx);
      const token = await this.auth.signInWithEntra(identity, metaOf(req));
      this.setSession(res, token);
      return res.redirect(`${this.appOrigin}${safeReturnTo(tx.returnTo)}`);
    } catch {
      // Details are in the audit log / server log; the browser only gets a generic reason.
      return fail('no_access');
    }
  }

  /** Local development only: sign in as a seeded persona. Returns 404 when disabled. */
  @Public()
  @Throttle(STRICT)
  @Post('dev/login')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Dev sign-in as a seeded persona',
    description:
      'Local development and tests only (404 elsewhere). Sets the session cookie, so every later request in ' +
      'Swagger / Bruno is signed in. GS-120 Super Admin · GS-119 HR · GS-101 Office Admin · GS-058 Team Lead · GS-087 Employee.',
  })
  @ApiNoContentResponse({ description: 'Signed in — session cookie set' })
  @ApiErrors(400, 403, 404, 429)
  async devLogin(@Body() dto: DevLoginDto, @Req() req: HrmsRequest, @Res({ passthrough: true }) res: Response) {
    const token = await this.auth.devSignIn(dto.employeeCode, metaOf(req));
    this.setSession(res, token);
  }

  /** Local development only: the login page's email + password form, for the seeded demo accounts. Public because it
      is a sign-in; refused (404) wherever dev login is off, which env validation enforces in production. */
  @Public()
  @Throttle(STRICT)
  @Post('dev/password-login')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Dev sign-in with email and password',
    description:
      'Local development only (404 elsewhere). Only the seeded demo accounts (…@hrms.local, see GET dev/personas) ' +
      'with the shared DEV_LOGIN_PASSWORD (default demo1234). Unknown email or wrong password → 401 ' +
      'auth.invalid_credentials (same answer for both); a deactivated account → 403. Every attempt is audited.',
  })
  @ApiNoContentResponse({ description: 'Signed in — session cookie set' })
  @ApiErrors(400, 401, 403, 404, 429)
  async devPasswordLogin(
    @Body() dto: DevPasswordLoginDto,
    @Req() req: HrmsRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.demoAccountSignIn(dto.email, dto.password, metaOf(req));
    this.setSession(res, token);
  }

  @Public()
  @Get('dev/personas')
  @ApiOperation({ summary: 'List dev personas', description: 'Local development only (404 elsewhere).' })
  @ApiOkResponse({ type: [DevPersonaResponse] })
  @ApiErrors(404)
  devPersonas() {
    return this.auth.devPersonas();
  }

  @SignedIn()
  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Who am I',
    description: 'The signed-in person, their role and granted permission keys. Call on app load; 401 → sign-in page.',
  })
  @ApiOkResponse({ type: MeResponse })
  @ApiErrors(401)
  me(@CurrentUser() user: AuthUser): MeResponse {
    return {
      employeeId: user.employeeId,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email,
      role: user.roleName,
      locationId: user.locationId,
      companyId: user.companyId,
      permissions: [...user.permissions].sort(),
    };
  }

  @SignedIn()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Sign out', description: 'Ends the session on the server and clears the cookie.' })
  @ApiNoContentResponse({ description: 'Signed out' })
  @ApiErrors(401, 403)
  async logout(@CurrentUser() user: AuthUser, @Req() req: HrmsRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.signOut(user.sessionId, user, metaOf(req));
    res.clearCookie(sessionCookieName(this.env), { ...sessionCookieOptions(this.env), maxAge: undefined });
  }
}
