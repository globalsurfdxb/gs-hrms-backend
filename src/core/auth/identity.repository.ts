import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

const ACCOUNT = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  entraObjectId: true,
  employmentStatus: true,
} as const;

/** Seeded demo accounts (prisma/seed.ts) use this email domain; only they can use the dev sign-in forms. */
export const DEMO_EMAIL_DOMAIN = 'hrms.local';

/* Reads the employee table for sign-in only. Core may not import modules, so auth keeps its own narrow queries
   instead of calling the employees module. */
@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEntraObjectId(oid: string) {
    return this.prisma.employee.findUnique({ where: { entraObjectId: oid }, select: ACCOUNT });
  }

  /** Only accounts not yet linked to Microsoft — a linked account is matched by oid, never by email. */
  findUnlinkedByEmail(email: string) {
    return this.prisma.employee.findFirst({
      where: { email: email.toLowerCase(), entraObjectId: null },
      select: ACCOUNT,
    });
  }

  findByCode(employeeCode: string) {
    return this.prisma.employee.findUnique({ where: { employeeCode }, select: ACCOUNT });
  }

  /** Emails are stored lower-case. */
  findByEmail(email: string) {
    return this.prisma.employee.findUnique({ where: { email: email.toLowerCase() }, select: ACCOUNT });
  }

  linkEntraObjectId(employeeId: string, oid: string) {
    return this.prisma.employee.update({ where: { id: employeeId }, data: { entraObjectId: oid }, select: ACCOUNT });
  }

  /** Seeded people for the dev persona picker (one per role). */
  devPersonas() {
    return this.prisma.employee.findMany({
      where: { employmentStatus: { not: 'INACTIVE' }, email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
      select: { employeeCode: true, fullName: true, email: true, role: { select: { name: true } } },
      orderBy: { employeeCode: 'asc' },
      take: 50,
    });
  }
}
