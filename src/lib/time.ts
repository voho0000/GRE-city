export const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar-day difference, safe across DST changes. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function addDays(t: number, days: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive days with activity, counting back from today (or yesterday if today has none yet). */
export function streakDays(logDays: Set<string>, now: number): number {
  let day = logDays.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (logDays.has(dayKey(day))) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
