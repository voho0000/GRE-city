import { addDays, dayKey, daysBetween, startOfDay } from './time';
import type { DistrictId, LogEntry, Rating, Srs, StudyOrder, Word } from './types';

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

export interface NewWordOrder {
  studyOrder: StudyOrder;
  focusDistrict: DistrictId;
  pauseNewOnBacklog?: boolean;
}

/** With this many reviews due, new words wait: catching up matters more than growing the pile. */
export function backlogThreshold(dailyNew: number): number {
  return Math.max(60, dailyNew * 3);
}

export function dueCount(words: Word[], now: number): number {
  return words.filter((w) => isDue(w.srs, now)).length;
}

export function isBacklogged(words: Word[], now: number, dailyNew: number, o: Pick<NewWordOrder, 'pauseNewOnBacklog'>): boolean {
  return !!o.pauseNewOnBacklog && dueCount(words, now) >= backlogThreshold(dailyNew);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Unlearned words in the order they should be introduced. Random order is reshuffled once a day, so
 * reopening the app on the same day shows the same words.
 */
export function orderNewWords(words: Word[], now: number, o: NewWordOrder): Word[] {
  const fresh = words.filter((w) => !w.srs);
  if (o.studyOrder === 'random') {
    const day = dayKey(now);
    const key = new Map(fresh.map((w) => [w.id, hashString(`${day}|${w.id}`)]));
    return fresh.sort((a, b) => key.get(a.id)! - key.get(b.id)! || a.order - b.order);
  }
  if (o.studyOrder === 'district') {
    // The chosen district first; once it is finished, carry on with the usual mix.
    const rank = (w: Word) => (w.district === o.focusDistrict ? 0 : 1);
    return fresh.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  }
  return fresh.sort((a, b) => a.order - b.order);
}

/** Today's queue: due reviews (most overdue first) interleaved with new words up to the daily limit. */
export function buildQueue(words: Word[], now: number, dailyNew: number, o: NewWordOrder = { studyOrder: 'mixed', focusDistrict: 'speech' }): string[] {
  const due = words.filter((w) => isDue(w.srs, now)).sort((a, b) => a.srs!.due - b.srs!.due || a.order - b.order);
  const paused = !!o.pauseNewOnBacklog && due.length >= backlogThreshold(dailyNew);
  const quota = paused ? 0 : Math.max(0, dailyNew - newIntroducedToday(words, now));
  const fresh = orderNewWords(words, now, o).slice(0, quota);
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

/**
 * Words whose latest answer today was 不會. Within a visit they come back a few cards later; this keeps them in
 * today's queue after leaving and returning, since their due date is already tomorrow.
 */
export function retryToday(logs: LogEntry[], now: number): string[] {
  const start = startOfDay(now);
  const last = new Map<string, Rating>();
  for (const l of [...logs].sort((a, b) => a.at - b.at)) if (l.at >= start) last.set(l.wordId, l.rating);
  return [...last].filter(([, r]) => r === 'again').map(([id]) => id);
}
