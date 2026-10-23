import { AppError } from '../../../shared/errors/app-error.js';
import {
  allowedJobActions,
  assertCanCreateJob,
  checkJobInput,
  jobHistory,
  jobStatusAfter,
  type JobAction,
  type JobInputCheck,
  type JobStatus,
} from './job.rules.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  return 'no error';
};
const job = (status: JobStatus, filled = 0, positions = 2) => ({ status, filled, positions });

describe('BR-HIR-005 creating a job', () => {
  it('needs an approved requisition without a job', () => {
    expect(() => assertCanCreateJob({ status: 'APPROVED', hasJob: false })).not.toThrow();
    expect(code(() => assertCanCreateJob({ status: 'ON_HOLD', hasJob: false }))).toBe('job.requisition_not_approved');
    expect(code(() => assertCanCreateJob({ status: 'APPROVED', hasJob: true }))).toBe('job.already_exists');
  });

  const ok: JobInputCheck = {
    description: ' Design client networks. ',
    skills: ['Cisco', ' cisco ', 'SD-WAN', ''],
    expMin: 2,
    expMax: 6,
    panelIds: ['a', 'b', 'a'],
  };

  it('trims and de-duplicates skills and the panel', () => {
    expect(checkJobInput(ok)).toEqual({
      description: 'Design client networks.',
      skills: ['Cisco', 'SD-WAN'],
      expMin: 2,
      expMax: 6,
      panelIds: ['a', 'b'],
    });
  });

  it.each([
    [{ description: '  ' }, 'job.description_required'],
    [{ skills: [' ', ''] }, 'job.skills_required'],
    [{ expMin: 5, expMax: 3 }, 'job.invalid_experience'],
    [{ expMin: -1 }, 'job.invalid_experience'],
    [{ panelIds: [] }, 'job.panel_required'],
  ])('refuses %j', (patch, expected) => {
    expect(code(() => checkJobInput({ ...ok, ...patch }))).toBe(expected);
  });
});

describe('BR-HIR-006 job status', () => {
  it.each([
    ['open', 'DRAFT', 'OPEN'],
    ['hold', 'OPEN', 'ON_HOLD'],
    ['resume', 'ON_HOLD', 'OPEN'],
    ['close', 'OPEN', 'CLOSED'],
    ['close', 'ON_HOLD', 'CLOSED'],
    ['reopen', 'CLOSED', 'OPEN'],
  ] as [JobAction, JobStatus, JobStatus][])('%s: %s → %s', (action, from, to) => {
    expect(jobStatusAfter(action, job(from)).status).toBe(to);
  });

  it.each([
    ['open', 'OPEN'],
    ['hold', 'DRAFT'],
    ['close', 'DRAFT'],
    ['resume', 'OPEN'],
    ['reopen', 'OPEN'],
    ['hold', 'FILLED'],
    ['close', 'FILLED'],
  ] as [JobAction, JobStatus][])('refuses %s from %s', (action, from) => {
    expect(code(() => jobStatusAfter(action, job(from)))).toBe('job.invalid_transition');
  });

  it('refuses to reopen when every position is filled', () => {
    expect(code(() => jobStatusAfter('reopen', job('CLOSED', 2, 2)))).toBe('job.no_open_positions');
  });

  it('lists the buttons the job page shows', () => {
    expect(allowedJobActions(job('DRAFT'))).toEqual(['open']);
    expect(allowedJobActions(job('OPEN'))).toEqual(['hold', 'close']);
    expect(allowedJobActions(job('ON_HOLD'))).toEqual(['resume', 'close']);
    expect(allowedJobActions(job('CLOSED'))).toEqual(['reopen']);
    expect(allowedJobActions(job('CLOSED', 2, 2))).toEqual([]);
    expect(allowedJobActions(job('FILLED', 2, 2))).toEqual([]);
  });

  it('writes history the way the frontend shows it', () => {
    expect(jobHistory.status('OPEN', 'ON_HOLD')).toBe('Status changed from Open to On Hold');
    expect(jobHistory.created('REQ-0001', 'DRAFT')).toBe('Job created from REQ-0001 as Draft');
  });
});
