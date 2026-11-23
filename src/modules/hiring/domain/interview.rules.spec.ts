import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertCanInterview,
  assertScheduled,
  checkInterviewInput,
  endOf,
  overlaps,
  PANEL_MAX,
  stageAfterScheduling,
} from './interview.rules.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'no error';
};

describe('BR-HIR-010 interviews', () => {
  const now = new Date('2026-11-23T08:00:00Z');
  const later = new Date('2026-11-24T06:00:00Z');
  const input =
    (patch: Partial<Parameters<typeof checkInterviewInput>[0]> = {}) =>
    () =>
      checkInterviewInput({ startsAt: later, now, panelIds: ['p1'], link: '', ...patch });

  it('only for an application in the pipeline, on a job that is not closed or filled', () => {
    const ok = { stage: 'SCREENING' as const, exit: null, jobStatus: 'OPEN' as const };
    expect(code(() => assertCanInterview(ok))).toBe('no error');
    expect(code(() => assertCanInterview({ ...ok, jobStatus: 'ON_HOLD' }))).toBe('no error');
    expect(code(() => assertCanInterview({ ...ok, exit: 'REJECTED' }))).toBe('interview.application_inactive');
    expect(code(() => assertCanInterview({ ...ok, stage: 'HIRED' }))).toBe('interview.application_inactive');
    expect(code(() => assertCanInterview({ ...ok, jobStatus: 'CLOSED' }))).toBe('interview.job_closed');
    expect(code(() => assertCanInterview({ ...ok, jobStatus: 'FILLED' }))).toBe('interview.job_closed');
  });

  it('refuses a time in the past, an empty or oversized panel, and a link that is not https', () => {
    expect(code(input())).toBe('no error');
    expect(code(input({ startsAt: new Date(now.getTime() - 60_000) }))).toBe('interview.in_past');
    expect(code(input({ panelIds: [] }))).toBe('interview.panel_required');
    expect(code(input({ panelIds: Array.from({ length: PANEL_MAX + 1 }, (_, i) => `p${i}`) }))).toBe(
      'interview.panel_too_large',
    );
    expect(code(input({ link: 'http://teams.example.com/x' }))).toBe('interview.invalid_link');
    expect(code(input({ link: 'https://teams.example.com/x y' }))).toBe('interview.invalid_link');
    expect(code(input({ link: 'https://teams.example.com/l/meetup-join/1' }))).toBe('no error');
  });

  it('moves the candidate forward to the round, never back; the final round moves nothing', () => {
    expect(stageAfterScheduling('APPLIED', 'TECHNICAL')).toBe('TECHNICAL_INTERVIEW');
    expect(stageAfterScheduling('APPLIED', 'SCREENING_CALL')).toBe('SCREENING');
    expect(stageAfterScheduling('HR_INTERVIEW', 'TECHNICAL')).toBeNull();
    expect(stageAfterScheduling('HR_INTERVIEW', 'HR')).toBeNull();
    expect(stageAfterScheduling('SCREENING', 'FINAL')).toBeNull();
  });

  it('only a scheduled interview changes', () => {
    expect(code(() => assertScheduled('SCHEDULED'))).toBe('no error');
    expect(code(() => assertScheduled('COMPLETED'))).toBe('interview.not_scheduled');
    expect(code(() => assertScheduled('CANCELLED'))).toBe('interview.not_scheduled');
  });

  it('clash = overlapping time, not only the same start', () => {
    const a = { start: later, end: endOf(later, 60) };
    expect(overlaps(a, { start: endOf(later, 30), end: endOf(later, 90) })).toBe(true);
    expect(overlaps(a, { start: endOf(later, 60), end: endOf(later, 120) })).toBe(false);
    expect(overlaps(a, { start: new Date(later.getTime() - 30 * 60_000), end: later })).toBe(false);
  });
});
