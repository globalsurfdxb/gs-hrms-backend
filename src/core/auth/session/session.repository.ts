import { Injectable } from '@nestjs/common';
import type { AuthMethod } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    tokenHash: string;
    employeeId: string;
    method: AuthMethod;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.session.create({ data, select: { id: true } });
  }

  /** The session with everything needed to build an AuthUser in one query. */
  findByTokenHash(tokenHash: string) {
    return this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            fullName: true,
            email: true,
            locationId: true,
            companyId: true,
            employmentStatus: true,
            role: { select: { id: true, name: true, permissions: { select: { key: true } } } },
          },
        },
      },
    });
  }

  touch(id: string, at: Date) {
    return this.prisma.session.update({ where: { id }, data: { lastSeenAt: at } });
  }

  revoke(id: string, at: Date) {
    return this.prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
  }

  revokeAllForEmployee(employeeId: string, at: Date) {
    return this.prisma.session.updateMany({ where: { employeeId, revokedAt: null }, data: { revokedAt: at } });
  }
}
