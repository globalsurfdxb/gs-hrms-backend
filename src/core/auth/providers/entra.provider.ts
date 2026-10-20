import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.js';
import { AppError } from '../../../shared/errors/app-error.js';

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

/** Carried in a signed, httpOnly cookie between /auth/login and /auth/callback. */
export interface SsoTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export interface VerifiedIdentity {
  /** Entra object id — the stable identity key. */
  oid: string;
  email: string;
  name: string;
}

/* Microsoft Entra ID sign-in: authorization code flow with PKCE, single tenant. MSAL validates the ID token
   signature, issuer, audience, expiry and nonce; we additionally pin the tenant id. Disabled until the
   ENTRA_* settings are present — dev login covers local work until then. */
@Injectable()
export class EntraProvider {
  private readonly client?: ConfidentialClientApplication;
  private readonly crypto = new CryptoProvider();
  private readonly tenantId?: string;
  private readonly redirectUri?: string;

  constructor(config: ConfigService<Env, true>) {
    const tenantId = config.get('ENTRA_TENANT_ID', { infer: true });
    const clientId = config.get('ENTRA_CLIENT_ID', { infer: true });
    const clientSecret = config.get('ENTRA_CLIENT_SECRET', { infer: true });
    this.redirectUri = config.get('ENTRA_REDIRECT_URI', { infer: true });
    if (tenantId && clientId && clientSecret && this.redirectUri) {
      this.tenantId = tenantId;
      this.client = new ConfidentialClientApplication({
        auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` },
      });
    }
  }

  get enabled() {
    return !!this.client;
  }

  async begin(returnTo: string): Promise<{ url: string; tx: SsoTransaction }> {
    const client = this.require();
    const { verifier, challenge } = await this.crypto.generatePkceCodes();
    const tx: SsoTransaction = {
      state: this.crypto.createNewGuid(),
      nonce: this.crypto.createNewGuid(),
      verifier,
      returnTo,
    };
    const url = await client.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: this.redirectUri!,
      state: tx.state,
      nonce: tx.nonce,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      prompt: 'select_account',
    });
    return { url, tx };
  }

  async complete(code: string, tx: SsoTransaction): Promise<VerifiedIdentity> {
    const client = this.require();
    const result = await client.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: this.redirectUri!,
      codeVerifier: tx.verifier,
      nonce: tx.nonce,
      state: tx.state,
    });
    const claims = result.idTokenClaims as Record<string, unknown>;
    if (claims['tid'] !== this.tenantId)
      throw new AppError('auth.wrong_tenant', 'Sign-in from another organisation', 403);
    if (claims['nonce'] !== tx.nonce) throw new AppError('auth.bad_nonce', 'Sign-in could not be verified', 401);

    const oid = claims['oid'];
    const email = claims['email'] ?? claims['preferred_username'];
    if (typeof oid !== 'string' || typeof email !== 'string') {
      throw new AppError('auth.incomplete_identity', 'Microsoft did not return an account id and email', 401);
    }
    return { oid, email: email.toLowerCase(), name: typeof claims['name'] === 'string' ? claims['name'] : email };
  }

  private require(): ConfidentialClientApplication {
    if (!this.client) throw new AppError('auth.sso_not_configured', 'Microsoft sign-in is not configured yet', 503);
    return this.client;
  }
}
