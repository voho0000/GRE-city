import { describe, expect, it } from 'vitest';
import { decode, diffLocal, encode, mergeData, type SyncData } from '../sync';
import type { Srs, Word } from '../types';

const srs = (level: number, lastAt: number): Srs => ({ level, due: lastAt + 86400000, lapses: 0, reps: 1, introducedAt: 1, lastAt });
const word = (id: string, extra: Partial<Word> = {}): Word => ({ id, word: id, zh: '中', pos: 'adj.', example: '', district: 'dock', order: id.charCodeAt(0), source: 'builtin', srs: null, ...extra });
const data = (words: Word[], extra: Partial<SyncData> = {}): SyncData => ({ words, logs: [], settings: { dailyNew: 50, onboarded: true, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const }, deleted: {}, ...extra });

describe('mergeData', () => {
  it('keeps progress made on either device', () => {
    const laptop = data([word('a', { srs: srs(2, 100) }), word('b')]);
    const phone = data([word('a'), word('b', { srs: srs(1, 200) })]);
    const m = mergeData(laptop, phone);
    expect(m.words.find((w) => w.id === 'a')?.srs?.level).toBe(2);
    expect(m.words.find((w) => w.id === 'b')?.srs?.level).toBe(1);
  });

  it('takes the most recent answer when both devices studied the same word', () => {
    const m = mergeData(data([word('a', { srs: srs(3, 100) })]), data([word('a', { srs: srs(0, 300) })]));
    expect(m.words[0].srs?.level).toBe(0);
  });

  it('takes the most recent edit of the word itself, independently of its progress', () => {
    const laptop = data([word('a', { district: 'speech', editedAt: 500, srs: srs(1, 100) })]);
    const phone = data([word('a', { srs: srs(2, 200) })]);
    const m = mergeData(laptop, phone);
    expect(m.words[0].district).toBe('speech');
    expect(m.words[0].srs?.level).toBe(2);
  });

  it('adds words imported on the other device', () => {
    const m = mergeData(data([word('a')]), data([word('a'), word('z', { source: 'import', editedAt: 9 })]));
    expect(m.words.map((w) => w.id)).toEqual(['a', 'z']);
  });

  it('keeps a deletion unless the word was studied again afterwards', () => {
    const del = data([], { deleted: { a: 1000, b: 1000 } });
    const other = data([word('a', { srs: srs(1, 500) }), word('b', { srs: srs(1, 2000) })]);
    expect(mergeData(del, other).words.map((w) => w.id)).toEqual(['b']);
    expect(mergeData(other, del).words.map((w) => w.id)).toEqual(['b']);
  });

  it('unions answer logs without duplicates', () => {
    const log = (at: number) => ({ at, wordId: 'a', rating: 'good' as const, isNew: false, levelBefore: 1, levelAfter: 2 });
    const m = mergeData(data([], { logs: [{ ...log(1), id: 7 }, log(2)] }), data([], { logs: [log(2), log(3)] }));
    expect(m.logs.map((l) => l.at)).toEqual([1, 2, 3]);
    expect(m.logs.every((l) => l.id === undefined)).toBe(true);
  });

  it('uses the most recently changed settings', () => {
    const a = data([], { settings: { dailyNew: 50, onboarded: true, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const, updatedAt: 10 } });
    const b = data([], { settings: { dailyNew: 20, onboarded: false, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const, updatedAt: 5 } });
    expect(mergeData(a, b).settings).toMatchObject({ dailyNew: 50, onboarded: true, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const });
    expect(mergeData(b, a).settings).toMatchObject({ dailyNew: 50, onboarded: true, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const });
  });

  it('is the same whichever side merges first', () => {
    const a = data([word('a', { srs: srs(2, 100) }), word('b', { editedAt: 5 })], { deleted: { c: 50 } });
    const b = data([word('a', { srs: srs(4, 50) }), word('c', { srs: srs(1, 10) }), word('b', { zh: '新', editedAt: 9 })]);
    expect(encode(mergeData(a, b), 0)).toBe(encode(mergeData(b, a), 0));
  });
});

describe('diffLocal', () => {
  it('lists only what changed on this device', () => {
    const local = data([word('a'), word('b')]);
    const merged = data([word('a'), word('b', { srs: srs(1, 5) }), word('c')]);
    const d = diffLocal(local, merged);
    expect(d.putWords.map((w) => w.id)).toEqual(['b', 'c']);
    expect(d.removeIds).toEqual([]);
    expect(d.settings).toBeNull();
  });
});

describe('encode / decode', () => {
  it('round-trips words, progress, logs, settings and deletions', () => {
    const d = data([word('a', { srs: srs(3, 100), editedAt: 4, kk: 'loˋkweʃəs' }), word('b', { source: 'import', example: 'An example.', kk: 'tɝs' }), word('c')], {
      logs: [{ at: 5, wordId: 'a', rating: 'hard', isNew: true, levelBefore: 0, levelAfter: 0 }],
      deleted: { x: 9 },
      settings: { dailyNew: 35, onboarded: true, autoSpeak: true, studyOrder: 'mixed' as const, focusDistrict: 'speech' as const, updatedAt: 3 },
    });
    expect(decode(encode(d))).toEqual(d);
  });

  it('rejects files that are not GRE City data', () => {
    expect(() => decode('{"hello":1}')).toThrow();
  });
});
