import { ApiProperty } from '@nestjs/swagger';
import { PersonRefResponse, RefResponse, person } from './common.response.js';

/** A department the caller may raise a requisition for, with the locations it can be based in. */
export class RequesterDepartmentResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Cloud & Infra' }) name: string;
  @ApiProperty({ type: RefResponse }) company: RefResponse;
  @ApiProperty({
    type: [RefResponse],
    description: 'Locations to choose from (id e.g. Dubai). Show a picker only when there is more than one.',
  })
  locations: RefResponse[];
}

/** What the requisition form may offer the caller (BR-HIR-019). */
export class RequisitionScopeResponse {
  @ApiProperty({
    description:
      'true = no full hiring access (Team Lead by default): company and department come from `departments`, the ' +
      'location from that department, and the caller is the hiring manager. false = every active company, department ' +
      'and hiring manager may be chosen; `departments` is empty.',
  })
  restricted: boolean;
  @ApiProperty({
    type: PersonRefResponse,
    nullable: true,
    description: 'The fixed hiring manager (the caller) when restricted; null otherwise',
  })
  hiringManager: PersonRefResponse | null;
  @ApiProperty({
    type: [PersonRefResponse],
    description:
      'Who may be chosen as hiring manager when not restricted: active employees whose role has Requisition ' +
      'approvals → Edit (BR-HIR-003), by name. Empty when restricted (you are the hiring manager).',
  })
  hiringManagers: PersonRefResponse[];
  @ApiProperty({
    type: [RequesterDepartmentResponse],
    description:
      'Their own department first, then the departments they head. Empty when restricted means none is set up.',
  })
  departments: RequesterDepartmentResponse[];
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Dubai',
    description: 'Location to preselect: the caller’s own when the department works there',
  })
  defaultLocationId: string | null;
}

/** Someone in a department, for the "Employee being replaced" picker. */
export class ReplaceablePersonResponse extends PersonRefResponse {
  @ApiProperty({ type: String, nullable: true, example: 'Network Engineer' }) designation: string | null;
  @ApiProperty({ enum: ['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'INACTIVE'], description: 'INACTIVE = has left' })
  status: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'INACTIVE';

  static from(
    this: void,
    e: {
      id: string;
      employeeCode: string;
      fullName: string;
      employmentStatus: ReplaceablePersonResponse['status'];
      designation: { title: string } | null;
    },
  ): ReplaceablePersonResponse {
    return { ...person(e), designation: e.designation?.title ?? null, status: e.employmentStatus };
  }
}
