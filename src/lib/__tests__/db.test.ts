import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addLog, loadAll, putWords, replaceAll } from '../db';
import { DEFAULT_SETTINGS } from '../types';

describe('db', () => {
  it('seeds the built-in list once, then persists changes', async () => {
    const first = await loadAll();
    expect(first.words.length).toBeGreaterThan(300);
    expect(first.settings).toEqual(DEFAULT_SETTINGS);

    const w = { ...first.words[0], srs: { level: 1, due: 1, lapses: 0, reps: 1, introducedAt: 1, lastAt: 1 } };
    await putWords([w]);
    await addLog({ at: 1, wordId: w.id, rating: 'good', isNew: true, levelBefore: 0, levelAfter: 1 });

    const second = await loadAll();
    expect(second.words).toHaveLength(first.words.length);
    expect(second.words.find((x) => x.id === w.id)?.srs?.level).toBe(1);
    expect(second.logs).toHaveLength(1);
  });

  it('restores a backup in place of everything', async () => {
    await replaceAll({ words: [], logs: [], settings: { dailyNew: 35, onboarded: true, autoSpeak: false, studyOrder: 'random' as const, focusDistrict: 'mind' as const, thinkSeconds: 0, pauseNewOnBacklog: false, examDate: '2027-01-15' }, deleted: {} });
    const snap = await loadAll();
    expect(snap.words).toHaveLength(0);
    expect(snap.settings).toEqual({ dailyNew: 35, onboarded: true, autoSpeak: false, studyOrder: 'random' as const, focusDistrict: 'mind' as const, thinkSeconds: 0, pauseNewOnBacklog: false, examDate: '2027-01-15' });
  });
});
