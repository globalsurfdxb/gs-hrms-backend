import type { Request } from 'express';

/** The signed-in person, attached to the request by SessionGuard. Always take identity from here — never from a
    body or query field such as `employeeId`. */
export interface AuthUser {
  sessionId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  locationId: string;
  companyId: string;
  permissions: ReadonlySet<string>;
}

export type HrmsRequest = Request & { user?: AuthUser; id?: string };
