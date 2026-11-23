import { instantIn, wallClockIn } from './wall-clock.js';

describe('instantIn / wallClockIn', () => {
  it('turns a local time into the instant, per location', () => {
    expect(instantIn('2026-12-01', '10:00', 'Asia/Dubai').toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(instantIn('2026-12-01', '11:30', 'Asia/Kolkata').toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(instantIn('2026-12-01', '02:00', 'Asia/Dubai').toISOString()).toBe('2026-11-30T22:00:00.000Z');
  });

  it('handles daylight saving (London, 29 Mar 2026: clocks go forward at 01:00 UTC)', () => {
    expect(instantIn('2026-03-28', '12:00', 'Europe/London').toISOString()).toBe('2026-03-28T12:00:00.000Z');
    expect(instantIn('2026-03-30', '12:00', 'Europe/London').toISOString()).toBe('2026-03-30T11:00:00.000Z');
  });

  it('round-trips', () => {
    const at = instantIn('2027-01-15', '09:45', 'Asia/Kolkata');
    expect(wallClockIn(at, 'Asia/Kolkata')).toEqual({ day: '2027-01-15', time: '09:45' });
    expect(wallClockIn(at, 'Asia/Dubai')).toEqual({ day: '2027-01-15', time: '08:15' });
  });

  it('refuses something that is not a date and time', () => {
    expect(() => instantIn('2026-02-30', '10:00', 'Asia/Dubai')).toThrow(RangeError);
    expect(() => instantIn('2026-02-28', '25:00', 'Asia/Dubai')).toThrow(RangeError);
  });
});
