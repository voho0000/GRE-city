import { addDays, daysBetween, startOfDay } from './time';
import type { Rating, Srs, Word } from './types';

/** Days until the next review once a word reaches each level. */
export const INTERVAL = [1, 1, 3, 7, 21, 60];
export const MAX_LEVEL = 5;

export type Decay = 'none' | 'faded' | 'weeds';

/** Faded once past due; weeds once overdue by more than a full interval. */
export function decayOf(srs: Srs | null, now: number): Decay {
  if (!srs) return 'none';
  const overdue = daysBetween(srs.due, now);
  if (overdue <= 0) return 'none';
  if (srs.level >= 1 && overdue > INTERVAL[srs.level]) return 'weeds';
  return 'faded';
}

export function isDue(srs: Srs | null, now: number): boolean {
  return !!srs && srs.due <= startOfDay(now);
}

export interface RatingResult {
  srs: Srs;
  levelBefore: number;
  levelAfter: number;
  days: number;
  repaired: boolean;
  isNew: boolean;
}

export function applyRating(prev: Srs | null, rating: Rating, now: number): RatingResult {
  const isNew = !prev;
  const levelBefore = prev ? prev.level : 0;
  let level = levelBefore;
  let days: number;
  let lapses = prev ? prev.lapses : 0;
  let repaired = false;

  if (rating === 'again') {
    level = 0;
    days = 1;
    lapses += 1;
  } else if (rating === 'hard') {
    days = Math.max(1, Math.round(INTERVAL[level] / 2));
  } else if (!isNew && decayOf(prev, now) === 'weeds') {
    // An overgrown building must be repaired before it can grow again.
    repaired = true;
    days = INTERVAL[level];
  } else {
    level = Math.min(MAX_LEVEL, level + 1);
    days = INTERVAL[level];
  }

  return {
    srs: {
      level,
      due: addDays(now, days),
      lapses,
      reps: (prev ? prev.reps : 0) + 1,
      introducedAt: prev ? prev.introducedAt : now,
      lastAt: now,
    },
    levelBefore,
    levelAfter: level,
    days,
    repaired,
    isNew,
  };
}

export function newIntroducedToday(words: Word[], now: number): number {
  const t0 = startOfDay(now);
  return words.filter((w) => w.srs && w.srs.introducedAt >= t0).length;
}

/** Today's queue: due reviews (most overdue first) interleaved with new words up to the daily limit. */
export function buildQueue(words: Word[], now: number, dailyNew: number): string[] {
  const due = words.filter((w) => isDue(w.srs, now)).sort((a, b) => a.srs!.due - b.srs!.due || a.order - b.order);
  const quota = Math.max(0, dailyNew - newIntroducedToday(words, now));
  const fresh = words.filter((w) => !w.srs).sort((a, b) => a.order - b.order).slice(0, quota);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    // Spread new words evenly between reviews.
    const takeNew = j < fresh.length && (i >= due.length || j * due.length <= i * fresh.length);
    out.push(takeNew ? fresh[j++].id : due[i++].id);
  }
  return out;
}
