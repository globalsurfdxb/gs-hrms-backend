import { Injectable } from '@nestjs/common';
import { actorOf } from '../../../core/audit/audit.service.js';
import type { AuthUser } from '../../../core/auth/auth-user.js';
import { employeeScopeOf } from '../../../core/iam/data-scope.js';
import { AppError, notFound } from '../../../shared/errors/app-error.js';
import { dateOfDay, dayOf } from '../../../shared/time/calendar-day.js';
import { EmployeeResponse } from '../api/dto/employee.response.js';
import type { UpdateEmploymentDto } from '../api/dto/update-employment.dto.js';
import {
  checkPlacement,
  emergencyGroupAfterMove,
  seatingAfterMove,
  type Placement,
} from '../domain/employment.rules.js';
import type { ProfileProblem } from '../domain/profile.rules.js';
import { EmploymentRepository, type EmploymentWrite } from '../infrastructure/employment.repository.js';
import { EmployeesRepository } from '../infrastructure/employees.repository.js';
import { assertCanEditEmployees } from './employee-access.js';

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
/** A real calendar day (the DTO only checks the shape, so 2024-02-31 is caught here). */
const isDay = (s: string) => !Number.isNaN(dateOfDay(s).getTime()) && dayOf(dateOfDay(s)) === s;

/* Employment record: name, organization, department, designation, reporting manager, location, type and joining date
   (spec docs/modules/employees.md, BR-EMP-001…004, BR-EMP-010). Needs Directory → Edit. One audit row per save that
   changes something, with readable before/after values; nothing here is sensitive. */
@Injectable()
export class EmploymentService {
  constructor(
    private readonly employment: EmploymentRepository,
    private readonly employees: EmployeesRepository,
  ) {}

  async update(employeeCode: string, dto: UpdateEmploymentDto, user: AuthUser): Promise<EmployeeResponse> {
    assertCanEditEmployees(user);
    const code = employeeCode.toUpperCase();
    const cur = await this.employment.findByCode(employeeScopeOf(user, 'edit'), code);
    if (!cur) throw notFound('employee');

    const next: Placement = {
      employeeId: cur.id,
      locationId: dto.locationId ?? cur.locationId,
      companyId: dto.companyId ?? cur.companyId,
      departmentId: dto.departmentId === undefined ? cur.departmentId : dto.departmentId,
      designationId: dto.designationId === undefined ? cur.designationId : dto.designationId,
      reportingManagerId: dto.reportingManagerId === undefined ? cur.reportingManagerId : dto.reportingManagerId,
    };
    const fullName = dto.fullName?.trim() ?? cur.fullName;
    const employmentType = dto.employmentType ?? cur.employmentType;
    const dateOfJoining = dto.dateOfJoining ?? dayOf(cur.dateOfJoining);

    const moved = next.locationId !== cur.locationId;
    const change = {
      organisation:
        moved ||
        next.companyId !== cur.companyId ||
        next.departmentId !== cur.departmentId ||
        next.designationId !== cur.designationId,
      companyChanged: next.companyId !== cur.companyId,
      manager: next.reportingManagerId !== cur.reportingManagerId,
    };

    const problems: ProfileProblem[] = [];
    if (!fullName) problems.push({ field: 'fullName', message: 'Name is required' });
    if (!isDay(dateOfJoining)) problems.push({ field: 'dateOfJoining', message: 'Joining date is not a real date' });
    const facts = await this.employment.lookup(next);
    problems.push(...checkPlacement(next, facts, change));
    if (problems.length) {
      throw new AppError('request.invalid', 'The employment details have invalid values', 400, {
        fields: problems.map((p) => p.message),
        problems,
      });
    }

    // What changed, in readable form for the audit row (names, not ids).
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const data: EmploymentWrite['data'] = {};
    const note = (key: string, from: string | null, to: string | null) => {
      before[key] = from;
      after[key] = to;
    };
    if (fullName !== cur.fullName) {
      data.fullName = fullName;
      note('name', cur.fullName, fullName);
    }
    if (moved) {
      data.locationId = next.locationId;
      note('location', cur.location.name, facts.names.location ?? next.locationId);
    }
    if (next.companyId !== cur.companyId) {
      data.companyId = next.companyId;
      note('organization', cur.company.name, facts.names.company ?? null);
    }
    if (next.departmentId !== cur.departmentId) {
      data.departmentId = next.departmentId;
      note('department', cur.department?.name ?? null, facts.names.department ?? null);
    }
    if (next.designationId !== cur.designationId) {
      data.designationId = next.designationId;
      note('designation', cur.designation?.title ?? null, facts.names.designation ?? null);
    }
    if (change.manager) {
      data.reportingManagerId = next.reportingManagerId;
      const was = cur.reportingManager
        ? `${cur.reportingManager.fullName} (${cur.reportingManager.employeeCode})`
        : null;
      note('reportingManager', was, facts.names.manager ?? null);
    }
    if (employmentType !== cur.employmentType) {
      data.employmentType = employmentType;
      note('employmentType', title(cur.employmentType), title(employmentType));
    }
    if (dateOfJoining !== dayOf(cur.dateOfJoining)) {
      data.dateOfJoining = dateOfDay(dateOfJoining);
      note('dateOfJoining', dayOf(cur.dateOfJoining), dateOfJoining);
    }

    // BR-EMP-001 / BR-EMP-010: a move switches the template-bound lists and drops a seat the new office lacks.
    const write: EmploymentWrite = { data, emergencyGroups: [] };
    if (moved && facts.names.template) {
      const to = facts.names.template;
      if (to !== cur.location.template) {
        write.emergencyGroups = cur.emergencyContacts
          .map((c) => ({ id: c.id, group: emergencyGroupAfterMove(c.group, to) }))
          .filter((c, i) => c.group !== cur.emergencyContacts[i]!.group);
        if (write.emergencyGroups.length)
          note('emergencyContactGroups', `${title(cur.location.template)} groups`, `${title(to)} groups`);
      }
      const seat = cur.profile?.seatingLocation ?? null;
      if (seat && seatingAfterMove(seat, facts.names.seating ?? []) === null) {
        write.seatingLocation = null;
        note('seatingLocation', seat, null);
      }
    }

    if (!Object.keys(after).length) {
      const same = await this.employees.findByCode(employeeScopeOf(user), code);
      return EmployeeResponse.from(same!);
    }
    const saved = await this.employment.save(cur.id, write, { before, after }, actorOf(user));
    return EmployeeResponse.from(saved);
  }
}
