import { describe, expect, it } from 'vitest';
import { KEEP_GAP, LEARNING_LIMIT, MAX_TRIES, SHORT_GAPS, dayStates, gateNew, learningIds, repeatGap, restingToday, step, weaveIn } from '../learning';
import type { Rating } from '../types';

const run = (ratings: Rating[], isNew = true) => ratings.reduce((s, r) => step(s, r, isNew), undefined as ReturnType<typeof step> | undefined);
const low = () => 0;
const high = () => 0.999;

describe('repeatGap', () => {
  it('repeats a missed word twice at short gaps, then once more at the end of the day', () => {
    expect(repeatGap(run(['again']), low)).toBe(SHORT_GAPS[0][0]);
    expect(repeatGap(run(['again']), high)).toBe(SHORT_GAPS[0][1]);
    expect(repeatGap(run(['again', 'again']), low)).toBe(SHORT_GAPS[1][0]);
    expect(repeatGap(run(['again', 'hard']), high)).toBe(SHORT_GAPS[1][1]);
    expect(repeatGap(run(['again', 'again', 'again']))).toBe('end');
    expect(repeatGap(run(['again', 'good']))).toBeNull();
    expect(repeatGap(run(['again', 'again', 'good']))).toBeNull();
  });
  it('rests a word for the day once its tries are used up', () => {
    const s = run(Array(MAX_TRIES).fill('again'));
    expect(repeatGap(s)).toBeNull();
    expect(restingToday(s)).toBe(true);
    expect(restingToday(run(['again', 'good']))).toBe(false);
  });
  it('keeps a word coming back past the rest point when the learner chooses to', () => {
    const s = run(Array(MAX_TRIES + 3).fill('again'));
    expect(restingToday(s, true)).toBe(false);
    expect(repeatGap(s, low, true)).toBe(KEEP_GAP[0]);
    expect(repeatGap(run(['again', 'again', 'again', 'again', 'good']), low, true)).toBeNull();
  });
  it('treats 看了才想起 on a new or missed word as not there yet, but not on an ordinary review', () => {
    expect(repeatGap(run(['hard']), low)).toBe(SHORT_GAPS[0][0]);
    expect(repeatGap(run(['hard'], false))).toBeNull();
    expect(repeatGap(run(['good']))).toBeNull();
  });
});

describe('dayStates / learningIds', () => {
  it('rebuilds today’s relearning list from the log, ignoring earlier days', () => {
    const now = new Date(2026, 9, 23, 18).getTime();
    const log = (wordId: string, rating: Rating, at: number, isNew = false) => ({ wordId, rating, at, isNew, levelBefore: 0, levelAfter: 0 });
    const logs = [log('a', 'again', now - 3600e3, true), log('b', 'again', now - 3600e3), log('b', 'good', now - 1800e3), log('c', 'again', now - 86400e3), log('d', 'hard', now - 60e3, true)];
    expect(learningIds(dayStates(logs, now))).toEqual(['a', 'd']);
  });
});

describe('gateNew', () => {
  const isNew = (id: string) => id.startsWith('n');
  it('pulls a relearning card ahead of a new word when too many are pending', () => {
    const learning = Array.from({ length: LEARNING_LIMIT }, (_, i) => `l${i}`);
    const q = ['n1', 'r1', ...learning];
    expect(gateNew(q, 0, new Set(learning), isNew)[0]).toBe('l0');
  });
  it('leaves the queue alone below the limit or for review cards', () => {
    const q = ['n1', 'l0', 'r1'];
    expect(gateNew(q, 0, new Set(['l0']), isNew)).toBe(q);
    expect(gateNew(['r1', 'l0'], 0, new Set(['l0']), isNew)[0]).toBe('r1');
  });
});

describe('weaveIn', () => {
  it('spreads pending words through the queue without duplicates', () => {
    const out = weaveIn(['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'y', 'a']);
    expect(out.filter((id) => id === 'a')).toHaveLength(1);
    expect(out.indexOf('y') - out.indexOf('x')).toBeGreaterThan(1);
    expect(out).toHaveLength(8);
  });
});
