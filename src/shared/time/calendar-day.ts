/* Calendar days ("YYYY-MM-DD") in a location's own timezone. A day in Dubai and a day in Kochi start at different
   instants, so "today" always depends on the location (Location.timezone, an IANA zone). */

/** Today's date in an IANA timezone, e.g. todayIn('Asia/Dubai') → "2026-10-22". */
export function todayIn(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A Postgres DATE (read by Prisma as midnight UTC) back to "YYYY-MM-DD". */
export const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** "YYYY-MM-DD" to the Date Prisma writes to a DATE column. */
export const dateOfDay = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
