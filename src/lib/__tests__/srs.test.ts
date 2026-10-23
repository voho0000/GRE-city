import { describe, expect, it } from 'vitest';
import { applyRating, buildQueue, decayOf, INTERVAL } from '../srs';
import { addDays, daysBetween } from '../time';
import type { Srs, Word } from '../types';

const NOW = new Date(2026, 9, 23, 10, 0).getTime();

function srs(level: number, dueInDays: number, extra: Partial<Srs> = {}): Srs {
  return { level, due: addDays(NOW, dueInDays), lapses: 0, reps: 1, introducedAt: addDays(NOW, -30), lastAt: addDays(NOW, -1), ...extra };
}

function word(id: string, order: number, s: Srs | null = null): Word {
  return { id, word: id, zh: '', pos: '', example: '', district: 'dock', order, source: 'builtin', srs: s };
}

describe('applyRating', () => {
  it('builds a cottage for a new word answered correctly, due tomorrow', () => {
    const r = applyRating(null, 'good', NOW);
    expect(r.isNew).toBe(true);
    expect(r.srs.level).toBe(1);
    expect(daysBetween(NOW, r.srs.due)).toBe(1);
    expect(r.srs.introducedAt).toBe(NOW);
  });

  it('leaves a foundation for a new word rated hard or again', () => {
    expect(applyRating(null, 'hard', NOW).srs.level).toBe(0);
    const again = applyRating(null, 'again', NOW);
    expect(again.srs.level).toBe(0);
    expect(again.srs.lapses).toBe(1);
  });

  it('raises a level and stretches the interval on good', () => {
    const r = applyRating(srs(2, 0), 'good', NOW);
    expect(r.levelAfter).toBe(3);
    expect(daysBetween(NOW, r.srs.due)).toBe(INTERVAL[3]);
  });

  it('caps at landmark and keeps reviewing every 60 days', () => {
    const r = applyRating(srs(5, 0), 'good', NOW);
    expect(r.levelAfter).toBe(5);
    expect(r.days).toBe(60);
  });

  it('keeps the level and halves the interval on hard', () => {
    const r = applyRating(srs(4, 0), 'hard', NOW);
    expect(r.levelAfter).toBe(4);
    expect(r.days).toBe(Math.round(INTERVAL[4] / 2));
  });

  it('tears back to the foundation on again and counts a lapse', () => {
    const r = applyRating(srs(4, 0, { lapses: 2 }), 'again', NOW);
    expect(r.levelAfter).toBe(0);
    expect(r.srs.lapses).toBe(3);
    expect(r.days).toBe(1);
  });

  it('repairs an overgrown building instead of raising it', () => {
    const overgrown = srs(2, -(INTERVAL[2] + 1));
    expect(decayOf(overgrown, NOW)).toBe('weeds');
    const r = applyRating(overgrown, 'good', NOW);
    expect(r.repaired).toBe(true);
    expect(r.levelAfter).toBe(2);
  });
});

describe('decayOf', () => {
  it('is fresh until due, faded once overdue, weeds past a full interval', () => {
    expect(decayOf(srs(3, 0), NOW)).toBe('none');
    expect(decayOf(srs(3, -1), NOW)).toBe('faded');
    expect(decayOf(srs(3, -INTERVAL[3]), NOW)).toBe('faded');
    expect(decayOf(srs(3, -INTERVAL[3] - 1), NOW)).toBe('weeds');
    expect(decayOf(srs(0, -10), NOW)).toBe('faded');
    expect(decayOf(null, NOW)).toBe('none');
  });
});

describe('buildQueue', () => {
  it('includes due reviews and fills new words up to the daily limit', () => {
    const words = [
      word('a', 0, srs(1, -2)),
      word('b', 1, srs(2, 0)),
      word('c', 2, srs(2, 3)),
      ...Array.from({ length: 80 }, (_, i) => word(`n${i}`, 10 + i)),
    ];
    const q = buildQueue(words, NOW, 50);
    expect(q).toContain('a');
    expect(q).toContain('b');
    expect(q).not.toContain('c');
    expect(q.filter((id) => id.startsWith('n'))).toHaveLength(50);
    expect(q.indexOf('n0')).toBeLessThan(q.indexOf('n49'));
  });

  it('counts words already introduced today against the limit', () => {
    const today = srs(1, 1, { introducedAt: NOW - 1000 });
    const words = [...Array.from({ length: 10 }, (_, i) => word(`t${i}`, i, today)), ...Array.from({ length: 80 }, (_, i) => word(`n${i}`, 20 + i))];
    expect(buildQueue(words, NOW, 50).filter((id) => id.startsWith('n'))).toHaveLength(40);
  });

  it('interleaves new words with reviews', () => {
    const words = [...Array.from({ length: 4 }, (_, i) => word(`r${i}`, i, srs(1, -1))), ...Array.from({ length: 4 }, (_, i) => word(`n${i}`, 10 + i))];
    const q = buildQueue(words, NOW, 50);
    expect(q.slice(0, 2).some((id) => id.startsWith('n'))).toBe(true);
    expect(q.slice(0, 2).some((id) => id.startsWith('r'))).toBe(true);
  });
});

describe('new word order', () => {
  const pool = (): Word[] =>
    Array.from({ length: 40 }, (_, i) => ({ ...word(`w${i}`, i), district: (i % 4 === 0 ? 'mind' : 'speech') as Word['district'] }));

  it('takes the chosen district first, then the usual mix', () => {
    const q = buildQueue(pool(), NOW, 15, { studyOrder: 'district', focusDistrict: 'mind' });
    expect(q.slice(0, 10).every((id) => Number(id.slice(1)) % 4 === 0)).toBe(true);
    expect(q).toHaveLength(15);
  });

  it('shuffles randomly but keeps the same order all day', () => {
    const o = { studyOrder: 'random' as const, focusDistrict: 'speech' as const };
    const a = buildQueue(pool(), NOW, 20, o);
    const sameDay = buildQueue(pool(), NOW + 3600000, 20, o);
    const nextDay = buildQueue(pool(), addDays(NOW, 1), 20, o);
    expect(sameDay).toEqual(a);
    expect(nextDay).not.toEqual(a);
    expect(a).not.toEqual(buildQueue(pool(), NOW, 20));
  });
});

describe('backlog', () => {
  it('pauses new words while reviews pile up, unless switched off', () => {
    const due = Array.from({ length: 150 }, (_, i) => word(`r${i}`, i, srs(1, -1)));
    const fresh = Array.from({ length: 50 }, (_, i) => word(`n${i}`, 200 + i));
    const all = [...due, ...fresh];
    const paused = buildQueue(all, NOW, 50, { studyOrder: 'mixed', focusDistrict: 'speech', pauseNewOnBacklog: true });
    expect(paused.filter((id) => id.startsWith('n'))).toHaveLength(0);
    expect(paused).toHaveLength(150);
    const normal = buildQueue(all, NOW, 50, { studyOrder: 'mixed', focusDistrict: 'speech', pauseNewOnBacklog: false });
    expect(normal.filter((id) => id.startsWith('n'))).toHaveLength(50);
    // Below the threshold new words flow as usual.
    const light = buildQueue([...due.slice(0, 20), ...fresh], NOW, 50, { studyOrder: 'mixed', focusDistrict: 'speech', pauseNewOnBacklog: true });
    expect(light.filter((id) => id.startsWith('n'))).toHaveLength(50);
  });
});


describe('lapses', () => {
  it('counts repeated misses of the same word on one day as a single lapse', () => {
    const now = new Date(2026, 9, 23, 10).getTime();
    const first = applyRating(null, 'again', now).srs;
    const second = applyRating(first, 'again', now + 600e3).srs;
    expect(second.lapses).toBe(1);
    expect(applyRating(second, 'again', addDays(now, 1)).srs.lapses).toBe(2);
  });
});
