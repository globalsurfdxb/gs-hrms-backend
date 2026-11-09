import { canSeeSalary, isOwnJob } from './job-scope.js';

const job = { hiringManagerId: 'hm', recruiterId: 'rec' };

describe('BR-HIR-022 own jobs', () => {
  it('is the hiring manager’s and the recruiter’s job, nobody else’s', () => {
    expect(isOwnJob(job, 'hm')).toBe(true);
    expect(isOwnJob(job, 'rec')).toBe(true);
    expect(isOwnJob(job, 'other')).toBe(false);
  });

  it('belongs to the hiring manager only while no recruiter is chosen', () => {
    expect(isOwnJob({ hiringManagerId: 'hm', recruiterId: null }, 'hm')).toBe(true);
    expect(isOwnJob({ hiringManagerId: 'hm', recruiterId: null }, 'rec')).toBe(false);
  });

  it('shows salary to full access, and to the hiring manager or recruiter of one of the jobs', () => {
    expect(canSeeSalary({ all: true, employeeId: 'other' }, [])).toBe(true);
    expect(canSeeSalary({ all: false, employeeId: 'rec' }, [job])).toBe(true);
    expect(canSeeSalary({ all: false, employeeId: 'hm' }, [job])).toBe(true);
    expect(canSeeSalary({ all: false, employeeId: 'other' }, [job])).toBe(false);
    expect(canSeeSalary({ all: false, employeeId: 'rec' }, [])).toBe(false);
  });
});
