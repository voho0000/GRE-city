import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '../../data/districts';
import { builtinWords } from '../../data/seed';
import { loadAll } from '../db';

describe('upgrading a city started on the 382-word list', () => {
  it('adds the new words, moves dock words to their new district and keeps progress and deletions', async () => {
    // A fresh city, then rewind it to look like the old list: only the first 382 words, "erudite" learned in the dock,
    // one new-list word deleted by the learner, and no KK on another.
    await loadAll();
    const raw = await openDB('gre-city');
    const all = (await raw.getAll('words')) as { id: string; order: number }[];
    const keep = new Set(all.sort((a, b) => a.order - b.order).slice(0, 382).map((w) => w.id));
    keep.add('erudite');
    keep.add('lucid');
    for (const w of all) if (!keep.has(w.id)) await raw.delete('words', w.id);
    const erudite = await raw.get('words', 'erudite');
    await raw.put('words', { ...erudite, district: 'dock', srs: { level: 3, due: 1, lapses: 1, reps: 4, introducedAt: 1, lastAt: 1 } });
    const lucid = await raw.get('words', 'lucid');
    await raw.put('words', { ...lucid, district: 'dock', kk: undefined });
    const gone = all.find((w) => !keep.has(w.id))!.id;
    await raw.put('meta', { [gone]: 5 }, 'deleted');
    await raw.put('meta', 1, 'builtinVersion');
    raw.close();

    const snap = await loadAll();
    const byId = new Map(snap.words.map((w) => [w.id, w]));
    expect(snap.words).toHaveLength(1199);
    expect(byId.has(gone)).toBe(false);
    expect(byId.get('erudite')).toMatchObject({ district: 'mind', srs: { level: 3, lapses: 1 } });
    expect(byId.get('lucid')).toMatchObject({ district: 'clarity', kk: 'ˋlusɪd' });
    const orders = snap.words.map((w) => w.order);
    expect(new Set(orders).size).toBe(orders.length);

    // Running again changes nothing.
    expect((await loadAll()).words).toHaveLength(1199);
  });
});

describe('built-in list', () => {
  it('spreads the 1200 words evenly over every district', () => {
    const counts = new Map(DISTRICTS.map((d) => [d.id, 0]));
    for (const w of builtinWords()) counts.set(w.district, counts.get(w.district)! + 1);
    for (const [, n] of counts) expect(n).toBeGreaterThanOrEqual(70);
  });
});
