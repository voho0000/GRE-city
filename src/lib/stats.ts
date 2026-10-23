import { dayKey } from './time';
import type { LogEntry, Rating } from './types';

/** A pause longer than this between two answers counts as a break, not study time. */
const MAX_GAP_MS = 2 * 60 * 1000;
/** Time credited for the first answer of a sitting. */
const FIRST_CARD_MS = 10 * 1000;

export interface DayChange {
  wordId: string;
  from: number;
  to: number;
}

export interface DaySummary {
  key: string;
  answers: number;
  built: string[];
  reviewed: number;
  raised: DayChange[];
  torn: DayChange[];
  landmarks: string[];
  forgotten: string[];
  ratings: Record<Rating, number>;
  minutes: number;
}

export function answersByDay(logs: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) {
    const k = dayKey(l.at);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Everything that happened on one calendar day, read from the answer log. */
export function summarizeDay(logs: LogEntry[], key: string): DaySummary {
  const day = logs.filter((l) => dayKey(l.at) === key).sort((a, b) => a.at - b.at);
  const ratings: Record<Rating, number> = { again: 0, hard: 0, good: 0 };
  const built: string[] = [];
  const forgotten = new Set<string>();
  const landmarks: string[] = [];
  // Net change per word over the day, so a word forgotten and then relearned shows once.
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  let reviewed = 0;
  let ms = 0;
  day.forEach((l, i) => {
    ratings[l.rating]++;
    if (l.isNew) {
      if (!built.includes(l.wordId)) built.push(l.wordId);
    } else {
      reviewed++;
      if (!first.has(l.wordId)) first.set(l.wordId, l.levelBefore);
      last.set(l.wordId, l.levelAfter);
    }
    if (l.rating === 'again') forgotten.add(l.wordId);
    if (l.levelAfter === 5 && l.levelBefore < 5 && !landmarks.includes(l.wordId)) landmarks.push(l.wordId);
    const gap = i === 0 ? FIRST_CARD_MS : l.at - day[i - 1].at;
    ms += gap > MAX_GAP_MS ? FIRST_CARD_MS : gap;
  });
  const raised: DayChange[] = [];
  const torn: DayChange[] = [];
  for (const [wordId, from] of first) {
    const to = last.get(wordId)!;
    if (to > from) raised.push({ wordId, from, to });
    else if (to < from) torn.push({ wordId, from, to });
  }
  return {
    key,
    answers: day.length,
    built,
    reviewed,
    raised,
    torn,
    landmarks,
    forgotten: [...forgotten],
    ratings,
    minutes: day.length ? Math.max(1, Math.round(ms / 60000)) : 0,
  };
}
