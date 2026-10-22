import { dateOfDay, dayOf, todayIn } from './calendar-day.js';

describe('todayIn', () => {
  // 22 Oct 2026, 20:00 UTC = 23 Oct in Dubai (UTC+4) and Kochi (UTC+5:30), still 22 Oct in UTC.
  const now = new Date('2026-10-22T20:00:00Z');

  it('uses the location timezone, not the server clock', () => {
    expect(todayIn('Asia/Dubai', now)).toBe('2026-10-23');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-10-23');
    expect(todayIn('UTC', now)).toBe('2026-10-22');
  });
});

describe('dayOf / dateOfDay', () => {
  it('round-trips a calendar day', () => {
    expect(dayOf(dateOfDay('2026-11-01'))).toBe('2026-11-01');
  });
});
