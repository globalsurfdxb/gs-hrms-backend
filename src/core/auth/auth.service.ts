import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMethod } from '../../generated/prisma/client.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { IdentityRepository } from './identity.repository.js';
import type { VerifiedIdentity } from './providers/entra.provider.js';
import { SessionService } from './session/session.service.js';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

type Account = NonNullable<Awaited<ReturnType<IdentityRepository['findByCode']>>>;

/* Turns a verified identity (Microsoft, or the dev persona picker) into an HRMS session. Every outcome —
   success, unknown account, inactive account — is written to the audit log under module "Security". */
@Injectable()
export class AuthService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get devLoginEnabled() {
    // Belt and braces: env validation already refuses AUTH_DEV_LOGIN in production.
    return (
      this.config.get('AUTH_DEV_LOGIN', { infer: true }) &&
      this.config.get('NODE_ENV', { infer: true }) !== 'production'
    );
  }

  async signInWithEntra(identity: VerifiedIdentity, meta: RequestMeta): Promise<string> {
    let account = await this.identities.findByEntraObjectId(identity.oid);
    if (!account) {
      // First Microsoft sign-in: link the HRMS employee created by onboarding to this Entra account.
      const unlinked = await this.identities.findUnlinkedByEmail(identity.email);
      if (unlinked) {
        account = await this.identities.linkEntraObjectId(unlinked.id, identity.oid);
        await this.audit.record({
          actor: { id: account.id, label: account.fullName },
          module: 'Security',
          action: 'auth.account_linked',
          entityType: 'employee',
          entityId: account.id,
          ip: meta.ip,
        });
      }
    }
    return this.openSession(account, 'ENTRA', identity.email, meta);
  }

  async devSignIn(employeeCode: string, meta: RequestMeta): Promise<string> {
    if (!this.devLoginEnabled) throw new AppError('auth.dev_login_disabled', 'Not found', 404);
    const account = await this.identities.findByCode(employeeCode);
    return this.openSession(account, 'DEV', employeeCode, meta);
  }

  async devPersonas() {
    if (!this.devLoginEnabled) throw new AppError('auth.dev_login_disabled', 'Not found', 404);
    const rows = await this.identities.devPersonas();
    return rows.map((r) => ({ employeeCode: r.employeeCode, fullName: r.fullName, role: r.role.name }));
  }

  async signOut(sessionId: string, actor: { employeeId: string; fullName: string }, meta: RequestMeta) {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      actor: { id: actor.employeeId, label: actor.fullName },
      module: 'Security',
      action: 'auth.sign_out',
      entityType: 'employee',
      entityId: actor.employeeId,
      ip: meta.ip,
    });
  }

  private async openSession(account: Account | null, method: AuthMethod, attempted: string, meta: RequestMeta) {
    if (!account || account.employmentStatus === 'INACTIVE') {
      await this.audit.record({
        actor: { id: null, label: attempted },
        module: 'Security',
        action: 'auth.sign_in_failed',
        entityType: 'employee',
        entityId: account?.id,
        after: { reason: account ? 'inactive' : 'no_account', method },
        ip: meta.ip,
      });
      // Same message for both cases: do not reveal which accounts exist.
      throw new AppError('auth.no_access', 'This account does not have access to GS HRMS', 403);
    }
    const token = await this.sessions.create(account.id, method, meta);
    await this.audit.record({
      actor: { id: account.id, label: account.fullName },
      module: 'Security',
      action: 'auth.sign_in',
      entityType: 'employee',
      entityId: account.id,
      after: { method },
      ip: meta.ip,
    });
    return token;
  }
}
