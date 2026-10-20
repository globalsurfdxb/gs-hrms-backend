import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMethod } from '../../../generated/prisma/client.js';
import type { Env } from '../../../config/env.js';
import type { AuthUser } from '../auth-user.js';
import { SessionRepository } from './session.repository.js';

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');
/** Avoid a database write on every request: only refresh last_seen_at once a minute. */
const TOUCH_AFTER_MS = 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Returns the raw token for the cookie. Only its hash is stored. */
  async create(employeeId: string, method: AuthMethod, meta: { ip?: string; userAgent?: string }) {
    const token = randomBytes(32).toString('base64url');
    const hours = this.config.get('SESSION_ABSOLUTE_HOURS', { infer: true });
    await this.sessions.create({
      tokenHash: hash(token),
      employeeId,
      method,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    });
    return token;
  }

  /** The signed-in user for a cookie token, or null if the session is unknown, revoked, expired or idle. */
  async resolve(token: string): Promise<AuthUser | null> {
    const s = await this.sessions.findByTokenHash(hash(token));
    if (!s || s.revokedAt) return null;

    const now = new Date();
    const idleMs = this.config.get('SESSION_IDLE_MINUTES', { infer: true }) * 60_000;
    const expired = s.expiresAt <= now || now.getTime() - s.lastSeenAt.getTime() > idleMs;
    // An inactive (offboarded) employee loses access immediately, even mid-session.
    if (expired || s.employee.employmentStatus === 'INACTIVE') {
      await this.sessions.revoke(s.id, now);
      return null;
    }
    if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_AFTER_MS) await this.sessions.touch(s.id, now);

    const e = s.employee;
    return {
      sessionId: s.id,
      employeeId: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      email: e.email,
      roleId: e.role.id,
      roleName: e.role.name,
      locationId: e.locationId,
      companyId: e.companyId,
      permissions: new Set(e.role.permissions.map((p) => p.key)),
    };
  }

  revoke(sessionId: string) {
    return this.sessions.revoke(sessionId, new Date());
  }

  /** Call when an employee is offboarded or their role changes. */
  revokeAllForEmployee(employeeId: string) {
    return this.sessions.revokeAllForEmployee(employeeId, new Date());
  }
}
