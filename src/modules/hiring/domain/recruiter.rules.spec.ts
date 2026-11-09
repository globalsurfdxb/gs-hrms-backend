import { canChooseRecruiter, canRecruit, handsOver, isTaManager, type RecruiterActor } from './recruiter.rules.js';

const actor = (roleName: string, designation: string | null = null, employeeId = 'me'): RecruiterActor => ({
  employeeId,
  roleName,
  designation,
});
const ta = { id: 'ta' };

describe('BR-HIR-021 recruiter hand-over', () => {
  it('knows the TA Manager by role or by designation', () => {
    expect(isTaManager(actor('Talent Acquisition Manager'))).toBe(true);
    expect(isTaManager(actor('HR', 'Talent Acquisition Manager'))).toBe(true);
    expect(isTaManager(actor('HR', 'HR Executive'))).toBe(false);
  });

  it('hands a new job to the TA Manager unless the creator is the TA Manager or a Super Admin', () => {
    expect(handsOver(actor('HR'), ta)).toBe(true);
    expect(handsOver(actor('Talent Acquisition Manager'), ta)).toBe(false);
    expect(handsOver(actor('HR', 'Talent Acquisition Manager'), ta)).toBe(false);
    expect(handsOver(actor('Super Admin'), ta)).toBe(false);
  });

  it('never hands over when there is no TA Manager', () => {
    expect(handsOver(actor('HR'), null)).toBe(false);
  });

  it('lets Super Admin, any TA Manager and the job’s TA Manager choose the recruiter', () => {
    const handed = { taManagerId: 'ta' };
    expect(canChooseRecruiter(actor('Super Admin'), handed, true)).toBe(true);
    expect(canChooseRecruiter(actor('Talent Acquisition Manager', null, 'other-ta'), handed, true)).toBe(true);
    expect(canChooseRecruiter(actor('Recruiter', null, 'ta'), handed, false)).toBe(true);
  });

  it('keeps HR off a handed-over job, but not off one with no TA Manager', () => {
    expect(canChooseRecruiter(actor('HR'), { taManagerId: 'ta' }, true)).toBe(false);
    expect(canChooseRecruiter(actor('HR'), { taManagerId: null }, true)).toBe(true);
    expect(canChooseRecruiter(actor('Recruiter'), { taManagerId: null }, false)).toBe(false);
  });

  it('takes recruiters from the Talent Acquisition team once there is one', () => {
    expect(canRecruit('Recruiter', true)).toBe(true);
    expect(canRecruit('Talent Acquisition Manager', true)).toBe(true);
    expect(canRecruit('HR Executive', true)).toBe(false);
    expect(canRecruit('HR Executive', false)).toBe(true);
    expect(canRecruit(null, false)).toBe(true);
  });
});
