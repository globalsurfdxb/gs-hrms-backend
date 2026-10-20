import type { CookieOptions } from 'express';
import type { Env } from '../../../config/env.js';

/* In production the cookie uses the __Host- prefix: browsers only accept it over HTTPS, on path /, with no
   Domain attribute — so no subdomain can set or read it. */
export const sessionCookieName = (env: Pick<Env, 'NODE_ENV'>) =>
  env.NODE_ENV === 'production' ? '__Host-hrms_sid' : 'hrms_sid';

export const sessionCookieOptions = (env: Pick<Env, 'NODE_ENV' | 'SESSION_ABSOLUTE_HOURS'>): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: env.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
});

/** Short-lived, signed cookie that carries the SSO state/nonce/PKCE verifier between /login and /callback. */
export const AUTH_TX_COOKIE = 'hrms_auth_tx';
export const authTxCookieOptions = (env: Pick<Env, 'NODE_ENV'>): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  signed: true,
  maxAge: 10 * 60 * 1000,
});
