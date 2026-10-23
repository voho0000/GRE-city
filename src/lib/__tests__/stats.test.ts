import { describe, expect, it } from 'vitest';
import { answersByDay, summarizeDay } from '../stats';
import { dayKey } from '../time';
import type { LogEntry } from '../types';

const T0 = new Date(2026, 9, 23, 9, 0).getTime();
const min = 60 * 1000;
const log = (at: number, wordId: string, rating: LogEntry['rating'], isNew: boolean, levelBefore: number, levelAfter: number): LogEntry => ({ at, wordId, rating, isNew, levelBefore, levelAfter });

describe('summarizeDay', () => {
  const logs = [
    log(T0, 'laud', 'good', true, 0, 1),
    log(T0 + 1 * min, 'terse', 'again', true, 0, 0),
    log(T0 + 2 * min, 'flux', 'good', false, 2, 3),
    log(T0 + 3 * min, 'wane', 'again', false, 4, 0),
    log(T0 + 4 * min, 'terse', 'good', false, 0, 1),
    log(T0 + 5 * min, 'ebb', 'good', false, 4, 5),
    // A break of an hour, then one more answer.
    log(T0 + 65 * min, 'flux', 'hard', false, 3, 3),
    // The next day.
    log(T0 + 24 * 60 * min, 'laud', 'good', false, 1, 2),
  ];
  const s = summarizeDay(logs, dayKey(T0));

  it('counts answers, new buildings and reviews for that day only', () => {
    expect(s.answers).toBe(7);
    expect(s.built).toEqual(['laud', 'terse']);
    expect(s.reviewed).toBe(5);
    expect(s.ratings).toEqual({ again: 2, hard: 1, good: 4 });
  });

  it('reports the net change of each reviewed word', () => {
    expect(s.raised).toEqual([{ wordId: 'flux', from: 2, to: 3 }, { wordId: 'terse', from: 0, to: 1 }, { wordId: 'ebb', from: 4, to: 5 }]);
    expect(s.torn).toEqual([{ wordId: 'wane', from: 4, to: 0 }]);
    expect(s.landmarks).toEqual(['ebb']);
    expect(s.forgotten).toEqual(['terse', 'wane']);
  });

  it('estimates study time without counting long breaks', () => {
    expect(s.minutes).toBe(5);
  });

  it('is empty on a day with no answers', () => {
    expect(summarizeDay(logs, '2026-10-01')).toMatchObject({ answers: 0, minutes: 0, built: [] });
  });

  it('counts answers per day', () => {
    expect([...answersByDay(logs).values()]).toEqual([7, 1]);
  });
});
