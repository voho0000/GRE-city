import { startOfDay } from './time';
import type { LogEntry, Rating } from './types';

/**
 * Same-day relearning. A word you missed comes back soon, mixed in among a couple of other words: first 1–2
 * cards later, then 2–3 cards later. Two quick repeats are the most that still help; if it is not there yet, it
 * goes to the end of today's list for one last try after a longer break, and after that rests until tomorrow
 * rather than turning into rote repetition. A new word you only half knew (看了才想起) counts as not there yet.
 */
export const SHORT_GAPS: [number, number][] = [[1, 2], [2, 3]];
/** Answers in one day after which a word that still is not recalled rests until tomorrow. */
export const MAX_TRIES = SHORT_GAPS.length + 2;
/** New words wait while this many words are still being relearned today. */
export const LEARNING_LIMIT = 6;

export interface DayState {
  /** First seen today as a new word. */
  newToday: boolean;
  /** Answers given today. */
  tries: number;
  agains: number;
  last: Rating;
}

export function step(prev: DayState | undefined, rating: Rating, isNew: boolean): DayState {
  const s = prev ?? { newToday: isNew, tries: 0, agains: 0, last: rating };
  return { ...s, tries: s.tries + 1, agains: s.agains + (rating === 'again' ? 1 : 0), last: rating };
}

/** Still not recalled: 不會, or 看了才想起 on a word that is new today or was missed today. */
const notYet = (s: DayState) => s.last === 'again' || (s.last === 'hard' && (s.newToday || s.agains > 0));

/**
 * When the word should come back today: a number of cards later, 'end' for the back of today's list, or null
 * when it is done for the day (recalled, or rested after too many tries).
 */
export function repeatGap(s: DayState | undefined, rand: () => number = Math.random): number | 'end' | null {
  if (!s || !notYet(s)) return null;
  const short = SHORT_GAPS[s.tries - 1];
  if (short) return short[0] + Math.floor(rand() * (short[1] - short[0] + 1));
  return s.tries < MAX_TRIES ? 'end' : null;
}

/** True when the word used up today's tries without being recalled and rests until tomorrow. */
export const restingToday = (s: DayState | undefined) => !!s && notYet(s) && s.tries >= MAX_TRIES;

export function dayStates(logs: LogEntry[], now: number): Map<string, DayState> {
  const start = startOfDay(now);
  const out = new Map<string, DayState>();
  for (const l of [...logs].sort((a, b) => a.at - b.at)) if (l.at >= start) out.set(l.wordId, step(out.get(l.wordId), l.rating, l.isNew));
  return out;
}

/** Words still being relearned today, in the order they were last answered. */
export function learningIds(states: Map<string, DayState>): string[] {
  return [...states].filter(([, s]) => repeatGap(s) !== null).map(([id]) => id);
}

/**
 * Before showing the card at `at`: if it is a new word while LEARNING_LIMIT or more words are still being
 * relearned, bring the next relearning card forward instead, so old misses are cleared before new words pile on.
 */
export function gateNew(queue: string[], at: number, learning: Set<string>, isNew: (id: string) => boolean): string[] {
  if (at >= queue.length || !isNew(queue[at])) return queue;
  const rest = queue.slice(at);
  if (new Set(rest.filter((id) => learning.has(id))).size < LEARNING_LIMIT) return queue;
  const j = rest.findIndex((id) => learning.has(id));
  if (j < 0) return queue;
  const next = [...queue];
  const [id] = next.splice(at + j, 1);
  next.splice(at, 0, id);
  return next;
}

/** Spreads words being relearned through a fresh queue, a few cards apart, instead of piling them at the end. */
export function weaveIn(queue: string[], ids: string[], gap = 2): string[] {
  const inQueue = new Set(queue);
  const out = [...queue];
  ids.filter((id) => !inQueue.has(id)).forEach((id, i) => out.splice(Math.min(i * (gap + 1) + 1, out.length), 0, id));
  return out;
}
