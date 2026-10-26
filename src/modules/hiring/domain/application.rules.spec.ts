import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertCanApply,
  exitApplication,
  moveStage,
  reopenApplication,
  type PipelineState,
} from './application.rules.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'no error';
};
const app = (patch: Partial<PipelineState> = {}): PipelineState => ({
  stage: 'SCREENING',
  exit: null,
  exitFrom: null,
  jobStatus: 'OPEN',
  offerSent: false,
  ...patch,
});

describe('BR-HIR-008 applying to a job', () => {
  it('needs an open job and no earlier application', () => {
    expect(() => assertCanApply({ status: 'OPEN' }, false)).not.toThrow();
    expect(code(() => assertCanApply({ status: 'ON_HOLD' }, false))).toBe('application.job_not_open');
    expect(code(() => assertCanApply({ status: 'OPEN' }, true))).toBe('application.already_applied');
  });
});

describe('BR-HIR-009 pipeline moves', () => {
  it('moves forward or back between the stages before Hired, with a history line', () => {
    expect(moveStage(app(), 'OFFER', ' Strong ')).toEqual({
      stage: 'OFFER',
      exit: null,
      exitFrom: null,
      exitReason: null,
      exitNote: null,
      history: { from: 'SCREENING', to: 'OFFER', note: 'Strong' },
    });
    expect(moveStage(app({ stage: 'HR_INTERVIEW' }), 'APPLIED')?.stage).toBe('APPLIED');
    expect(moveStage(app(), 'SCREENING')).toBeNull();
  });

  it('never moves to or from Hired, nor while the job is closed or filled', () => {
    expect(code(() => moveStage(app(), 'HIRED'))).toBe('application.hired_by_offer');
    expect(code(() => moveStage(app({ stage: 'HIRED' }), 'OFFER'))).toBe('application.already_hired');
    expect(code(() => moveStage(app({ jobStatus: 'CLOSED' }), 'OFFER'))).toBe('application.job_closed');
    expect(code(() => moveStage(app({ jobStatus: 'FILLED' }), 'OFFER'))).toBe('application.job_closed');
  });

  it('brings an exited application back to the chosen stage', () => {
    const back = moveStage(app({ exit: 'ON_HOLD', exitFrom: 'SCREENING' }), 'TECHNICAL_INTERVIEW');
    expect(back).toMatchObject({ stage: 'TECHNICAL_INTERVIEW', exit: null, exitFrom: null });
    expect(back?.history).toMatchObject({ from: 'ON_HOLD', to: 'TECHNICAL_INTERVIEW' });
  });

  it('refuses to move a candidate out of Offer while the offer is out (Q7)', () => {
    expect(code(() => moveStage(app({ stage: 'OFFER', offerSent: true }), 'SCREENING'))).toBe('application.offer_out');
  });
});

describe('BR-HIR-009 exits and reopen', () => {
  it('rejects with one of the reasons and records reason and note', () => {
    const r = exitApplication(app(), 'REJECTED', 'Skills mismatch', ' No SD-WAN ');
    expect(r).toMatchObject({ stage: 'SCREENING', exit: 'REJECTED', exitFrom: 'SCREENING', exitNote: 'No SD-WAN' });
    expect(r.history).toEqual({ from: 'SCREENING', to: 'REJECTED', note: 'Skills mismatch — No SD-WAN' });
    expect(code(() => exitApplication(app(), 'REJECTED', ' ', null))).toBe('application.reason_required');
    expect(code(() => exitApplication(app(), 'REJECTED', 'Too tall', null))).toBe('application.invalid_reason');
  });

  it('takes a free reason for withdrawn and on hold, and keeps the original stage when the exit changes', () => {
    const held = exitApplication(
      app({ exit: 'ON_HOLD', exitFrom: 'APPLIED' }),
      'WITHDRAWN',
      'Withdrawn by candidate',
      null,
    );
    expect(held).toMatchObject({ exit: 'WITHDRAWN', exitFrom: 'APPLIED' });
    expect(held.history.from).toBe('ON_HOLD');
  });

  it('refuses an exit after Hired or while the offer is out (Q7)', () => {
    expect(code(() => exitApplication(app({ stage: 'HIRED' }), 'WITHDRAWN', null, null))).toBe(
      'application.already_hired',
    );
    expect(code(() => exitApplication(app({ stage: 'OFFER', offerSent: true }), 'ON_HOLD', null, null))).toBe(
      'application.offer_out',
    );
  });

  it('reopens to the stage it left from, or refuses when not exited or the job is closed', () => {
    const r = reopenApplication(app({ exit: 'REJECTED', exitFrom: 'HR_INTERVIEW' }));
    expect(r).toMatchObject({ stage: 'HR_INTERVIEW', exit: null, history: { note: 'Reopened' } });
    expect(code(() => reopenApplication(app()))).toBe('application.not_exited');
    expect(code(() => reopenApplication(app({ exit: 'REJECTED', exitFrom: 'APPLIED', jobStatus: 'CLOSED' })))).toBe(
      'application.job_closed',
    );
  });
});
