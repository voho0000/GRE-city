import { startOfDay } from './time';
import type { LogEntry, Rating } from './types';

/**
 * Same-day relearning. A word you missed comes back a few cards later, with the gap growing each time so the
 * answer has to come from memory rather than from the card you just saw. It stays in today's loop until you
 * recall it, but after MAX_AGAIN misses in one day it rests until tomorrow: past that point more repetition
 * mostly breeds fatigue. A new word you only half knew (看了才想起) gets one more pass to settle it.
 */
export const AGAIN_GAPS = [3, 5, 8];
export const HARD_GAP = 8;
export const MAX_AGAIN = 4;
/** New words wait while this many words are still being relearned today. */
export const LEARNING_LIMIT = 6;

export interface DayState {
  /** First seen today as a new word. */
  newToday: boolean;
  agains: number;
  /** 看了才想起 answers since the last 不會 (or since first seen). */
  hardsSince: number;
  last: Rating;
}

export function step(prev: DayState | undefined, rating: Rating, isNew: boolean): DayState {
  const s = prev ?? { newToday: isNew, agains: 0, hardsSince: 0, last: rating };
  if (rating === 'again') return { ...s, agains: s.agains + 1, hardsSince: 0, last: rating };
  if (rating === 'hard') return { ...s, hardsSince: s.hardsSince + 1, last: rating };
  return { ...s, last: rating };
}

/** How many cards later the word should come back today, or null when it is done for the day. */
export function repeatGap(s: DayState | undefined): number | null {
  if (!s) return null;
  if (s.last === 'again') return s.agains >= MAX_AGAIN ? null : AGAIN_GAPS[Math.min(s.agains, AGAIN_GAPS.length) - 1];
  if (s.last === 'hard' && (s.newToday || s.agains > 0) && s.hardsSince === 1) return HARD_GAP;
  return null;
}

/** True when the word hit today's miss limit and rests until tomorrow. */
export const restingToday = (s: DayState | undefined) => !!s && s.last === 'again' && s.agains >= MAX_AGAIN;

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
export function weaveIn(queue: string[], ids: string[], gap = AGAIN_GAPS[0]): string[] {
  const inQueue = new Set(queue);
  const out = [...queue];
  ids.filter((id) => !inQueue.has(id)).forEach((id, i) => out.splice(Math.min(i * (gap + 1) + 1, out.length), 0, id));
  return out;
}
