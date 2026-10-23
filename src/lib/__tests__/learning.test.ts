import { describe, expect, it } from 'vitest';
import { AGAIN_GAPS, HARD_GAP, LEARNING_LIMIT, MAX_AGAIN, dayStates, gateNew, learningIds, repeatGap, restingToday, step, weaveIn } from '../learning';
import type { Rating } from '../types';

const run = (ratings: Rating[], isNew = true) => ratings.reduce((s, r) => step(s, r, isNew), undefined as ReturnType<typeof step> | undefined);

describe('repeatGap', () => {
  it('brings a missed word back with growing gaps until it is recalled', () => {
    expect(repeatGap(run(['again']))).toBe(AGAIN_GAPS[0]);
    expect(repeatGap(run(['again', 'again']))).toBe(AGAIN_GAPS[1]);
    expect(repeatGap(run(['again', 'again', 'again']))).toBe(AGAIN_GAPS[2]);
    expect(repeatGap(run(['again', 'good']))).toBeNull();
  });
  it('rests a word for the day after too many misses', () => {
    const s = run(Array(MAX_AGAIN).fill('again'));
    expect(repeatGap(s)).toBeNull();
    expect(restingToday(s)).toBe(true);
  });
  it('gives a half-known new or relearned word one more pass, but not an ordinary review', () => {
    expect(repeatGap(run(['hard']))).toBe(HARD_GAP);
    expect(repeatGap(run(['hard', 'hard']))).toBeNull();
    expect(repeatGap(run(['again', 'hard']))).toBe(HARD_GAP);
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
