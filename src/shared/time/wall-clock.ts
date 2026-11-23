/* Wall-clock times ("YYYY-MM-DD" + "HH:MM") in a location's own timezone, and the instants they stand for. An
   interview at 10:00 in Dubai and one at 11:30 in Kochi are the same moment; clash checks compare instants, while
   people read and type the local time of the location (Location.timezone, an IANA zone). */

const parts = (timezone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function fields(at: Date, timezone: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts(timezone).formatToParts(at)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Minutes the timezone is ahead of UTC at that instant (Dubai +240, Kochi +330). */
function offsetMinutes(timezone: string, at: Date): number {
  const f = fields(at, timezone);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** "2026-12-01" + "10:00" in Asia/Dubai → 2026-12-01T06:00:00.000Z. */
export function instantIn(day: string, time: string, timezone: string): Date {
  const naive = new Date(`${day}T${time}:00.000Z`);
  // Invalid, or rolled over (30 February → 2 March): not a real day and time.
  if (Number.isNaN(naive.getTime()) || naive.toISOString().slice(0, 16) !== `${day}T${time}`) {
    throw new RangeError(`Not a date and time: ${day} ${time}`);
  }
  const first = offsetMinutes(timezone, naive);
  const at = new Date(naive.getTime() - first * 60_000);
  // Near a daylight-saving change the offset at the result can differ from the first guess; use that one.
  const second = offsetMinutes(timezone, at);
  return second === first ? at : new Date(naive.getTime() - second * 60_000);
}

/** The local day and time of an instant: 2026-12-01T06:00Z in Asia/Dubai → { day: "2026-12-01", time: "10:00" }. */
export function wallClockIn(at: Date, timezone: string): { day: string; time: string } {
  const f = fields(at, timezone);
  const two = (n: number) => String(n).padStart(2, '0');
  return { day: `${f.year}-${two(f.month)}-${two(f.day)}`, time: `${two(f.hour)}:${two(f.minute)}` };
}
