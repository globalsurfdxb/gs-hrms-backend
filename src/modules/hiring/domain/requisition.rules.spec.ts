import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertEditable,
  canDecideStep,
  checkRequisitionInput,
  decidableLabels,
  decideStep,
  statusAfter,
  stepsForSubmit,
  toMinor,
  type Actor,
  type RequisitionInputCheck,
} from './requisition.rules.js';

const NOW = new Date('2026-10-22T08:00:00Z');
const MANAGER = 'mgr';
/** Raised by someone other than the deciders below. */
const P = { hiringManagerId: MANAGER, raisedById: 'raiser' };
const actor = (employeeId: string, roleName: string): Actor => ({ employeeId, roleName });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'no error';
};

describe('BR-HIR-001 editing and submitting', () => {
  it.each(['DRAFT', 'REJECTED'] as const)('allows changes while %s', (s) => {
    expect(() => assertEditable(s)).not.toThrow();
  });

  it.each(['PENDING_APPROVAL', 'APPROVED', 'ON_HOLD', 'CLOSED'] as const)('refuses changes while %s', (s) => {
    expect(code(() => assertEditable(s))).toBe('requisition.not_editable');
  });

  it('starts the chain at the Hiring Manager step', () => {
    const steps = stepsForSubmit('someone-else', MANAGER, NOW);
    expect(steps.map((s) => [s.label, s.status])).toEqual([
      ['HIRING_MANAGER', 'PENDING'],
      ['HR', 'WAITING'],
      ['MANAGEMENT', 'WAITING'],
    ]);
  });

  it('auto-approves the Hiring Manager step when the manager submits', () => {
    const steps = stepsForSubmit(MANAGER, MANAGER, NOW);
    expect(steps[0]).toMatchObject({ status: 'APPROVED', decidedById: MANAGER, decidedAt: NOW });
    expect(steps[1].status).toBe('PENDING');
  });
});

describe('BR-HIR-002 deciding steps', () => {
  it('lets only the hiring manager (or Super Admin) decide the Hiring Manager step', () => {
    expect(canDecideStep('HIRING_MANAGER', actor(MANAGER, 'Team Lead'), P)).toBe(true);
    expect(canDecideStep('HIRING_MANAGER', actor('other', 'HR'), P)).toBe(false);
    expect(canDecideStep('HIRING_MANAGER', actor('sa', 'Super Admin'), P)).toBe(true);
  });

  it('gives the HR step to HR and Office Admin, Management to Super Admin', () => {
    expect(canDecideStep('HR', actor('x', 'HR'), P)).toBe(true);
    expect(canDecideStep('HR', actor('x', 'Office Admin'), P)).toBe(true);
    expect(canDecideStep('HR', actor('x', 'Team Lead'), P)).toBe(false);
    expect(canDecideStep('MANAGEMENT', actor('x', 'HR'), P)).toBe(false);
    expect(canDecideStep('MANAGEMENT', actor('x', 'Super Admin'), P)).toBe(true);
  });

  it('never lets the raiser decide the HR or Management step of their own requisition', () => {
    const own = { hiringManagerId: MANAGER, raisedById: 'hr' };
    expect(canDecideStep('HR', actor('hr', 'HR'), own)).toBe(false);
    expect(canDecideStep('MANAGEMENT', actor('hr', 'Super Admin'), own)).toBe(false);
    expect(canDecideStep('HR', actor('other-hr', 'HR'), own)).toBe(true);
    const steps = stepsForSubmit('hr', MANAGER, NOW).map((s) =>
      s.label === 'HIRING_MANAGER'
        ? { ...s, status: 'APPROVED' as const }
        : s.label === 'HR'
          ? { ...s, status: 'PENDING' as const }
          : s,
    );
    expect(code(() => decideStep('PENDING_APPROVAL', steps, own, actor('hr', 'HR'), 'APPROVED', '', NOW))).toBe(
      'requisition.own_request',
    );
  });

  it('never lets a Super Admin decide the Hiring Manager step of a requisition they raised for someone else', () => {
    const own = { hiringManagerId: MANAGER, raisedById: 'sa' };
    expect(canDecideStep('HIRING_MANAGER', actor('sa', 'Super Admin'), own)).toBe(false);
    expect(canDecideStep('HIRING_MANAGER', actor(MANAGER, 'Team Lead'), own)).toBe(true);
    expect(canDecideStep('HIRING_MANAGER', actor('other-sa', 'Super Admin'), own)).toBe(true);
    // A hiring manager who raised it but had someone else submit still decides their own step.
    const raisedByManager = { hiringManagerId: MANAGER, raisedById: MANAGER };
    expect(canDecideStep('HIRING_MANAGER', actor(MANAGER, 'Team Lead'), raisedByManager)).toBe(true);
    const steps = stepsForSubmit('sa', MANAGER, NOW);
    expect(
      code(() => decideStep('PENDING_APPROVAL', steps, own, actor('sa', 'Super Admin'), 'APPROVED', '', NOW)),
    ).toBe('requisition.own_request');
  });

  it('lists the steps a role can decide for others', () => {
    expect(decidableLabels('HR')).toEqual(['HR']);
    expect(decidableLabels('Super Admin')).toEqual(['HIRING_MANAGER', 'HR', 'MANAGEMENT']);
    expect(decidableLabels('Team Lead')).toEqual([]);
  });

  it('walks the whole chain to APPROVED', () => {
    let steps = stepsForSubmit(MANAGER, MANAGER, NOW);
    let r = decideStep('PENDING_APPROVAL', steps, P, actor('hr', 'HR'), 'APPROVED', '', NOW);
    expect(r.status).toBe('PENDING_APPROVAL');
    expect(r.steps[2].status).toBe('PENDING');
    steps = r.steps;
    r = decideStep('PENDING_APPROVAL', steps, P, actor('sa', 'Super Admin'), 'APPROVED', 'Go ahead', NOW);
    expect(r.status).toBe('APPROVED');
    expect(r.decided).toMatchObject({ label: 'MANAGEMENT', status: 'APPROVED', decidedById: 'sa', note: 'Go ahead' });
  });

  it('rejects the requisition when any step rejects, and needs a note', () => {
    const steps = stepsForSubmit('raiser', MANAGER, NOW);
    expect(
      code(() => decideStep('PENDING_APPROVAL', steps, P, actor(MANAGER, 'Team Lead'), 'REJECTED', '  ', NOW)),
    ).toBe('requisition.note_required');
    const r = decideStep('PENDING_APPROVAL', steps, P, actor(MANAGER, 'Team Lead'), 'REJECTED', 'No budget', NOW);
    expect(r.status).toBe('REJECTED');
    expect(r.steps[1].status).toBe('WAITING');
  });

  it('refuses a decision from the wrong person (403) or on a requisition not pending (409)', () => {
    const steps = stepsForSubmit('raiser', MANAGER, NOW);
    expect(code(() => decideStep('PENDING_APPROVAL', steps, P, actor('hr', 'HR'), 'APPROVED', '', NOW))).toBe(
      'requisition.not_your_step',
    );
    expect(code(() => decideStep('APPROVED', steps, P, actor(MANAGER, 'Team Lead'), 'APPROVED', '', NOW))).toBe(
      'requisition.not_pending',
    );
  });
});

describe('BR-HIR-003 input', () => {
  const ok: RequisitionInputCheck = {
    positions: 2,
    budgetMin: '9000',
    budgetMax: '12000.50',
    targetStart: '2026-11-01',
    today: '2026-10-22',
    reason: 'NEW_ROLE',
    replacesEmployeeId: null,
  };

  it('accepts a valid requisition', () => {
    expect(() => checkRequisitionInput(ok)).not.toThrow();
    expect(() => checkRequisitionInput({ ...ok, targetStart: ok.today })).not.toThrow();
  });

  it.each([
    [{ positions: 0 }, 'requisition.invalid_positions'],
    [{ positions: 1.5 }, 'requisition.invalid_positions'],
    [{ budgetMin: '0' }, 'requisition.invalid_budget'],
    [{ budgetMax: '8999.99' }, 'requisition.invalid_budget'],
    [{ budgetMin: '9,000' }, 'requisition.invalid_amount'],
    [{ targetStart: '2026-10-21' }, 'requisition.start_in_past'],
    [{ reason: 'REPLACEMENT' as const }, 'requisition.replacement_required'],
  ])('refuses %j', (patch, expected) => {
    expect(code(() => checkRequisitionInput({ ...ok, ...patch }))).toBe(expected);
  });

  it('compares money without floats', () => {
    expect(toMinor('0.1') + toMinor('0.2')).toBe(toMinor('0.3'));
    expect(toMinor('12000.5')).toBe(1200050n);
  });
});

describe('BR-HIR-004 hold, resume, close', () => {
  it('follows the state diagram', () => {
    expect(statusAfter('hold', 'APPROVED')).toBe('ON_HOLD');
    expect(statusAfter('resume', 'ON_HOLD')).toBe('APPROVED');
    expect(statusAfter('close', 'ON_HOLD')).toBe('CLOSED');
  });

  it.each([
    ['hold', 'DRAFT'],
    ['resume', 'APPROVED'],
    ['resume', 'PENDING_APPROVAL'],
    ['close', 'PENDING_APPROVAL'],
    ['close', 'CLOSED'],
  ] as const)('refuses %s from %s', (action, from) => {
    expect(code(() => statusAfter(action, from))).toBe('requisition.invalid_transition');
  });
});
