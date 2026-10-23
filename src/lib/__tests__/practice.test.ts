import { describe, expect, it } from 'vitest';
import { builtinWords } from '../../data/seed';
import { examPlan } from '../plan';
import { makeQuestions, OPTION_COUNT, seededRandom } from '../practice';
import { buildSynonymIndex, meaningParts } from '../synonyms';
import type { Word } from '../types';

const learned = (words: Word[], n: number) => words.map((w, i) => (i < n ? { ...w, srs: { level: 2, due: 0, lapses: 0, reps: 1, introducedAt: 1, lastAt: 1 } } : w));

describe('synonyms', () => {
  it('splits glosses into senses', () => {
    expect(meaningParts('易變的、不穩定的')).toEqual(['易變的', '不穩定的']);
    expect(meaningParts('誹謗（口頭）')).toEqual(['誹謗']);
  });

  it('links words that share a sense', () => {
    const idx = buildSynonymIndex(builtinWords());
    expect(idx.get('pernicious')).toEqual(expect.arrayContaining(['deleterious', 'detrimental']));
    expect(idx.get('portend')).toEqual(expect.arrayContaining(['presage', 'augur']));
  });
});

describe('SE questions', () => {
  const words = learned(builtinWords(), 600);
  const byId = new Map(words.map((w) => [w.id, w]));
  const qs = makeQuestions(words, 30, seededRandom(42));

  it('builds full rounds from learned words', () => {
    expect(qs).toHaveLength(30);
    for (const q of qs) {
      expect(q.options).toHaveLength(OPTION_COUNT);
      expect(new Set(q.options).size).toBe(OPTION_COUNT);
      expect(q.options).toEqual(expect.arrayContaining(q.answer));
    }
  });

  it('has exactly one synonym pair among the options', () => {
    for (const q of qs) {
      const [a, b] = q.answer.map((id) => byId.get(id)!);
      expect(meaningParts(a.zh)).toContain(q.sense);
      expect(meaningParts(b.zh)).toContain(q.sense);
      const senses = new Set([...meaningParts(a.zh), ...meaningParts(b.zh)]);
      for (const id of q.options.filter((o) => !q.answer.includes(o))) {
        expect(meaningParts(byId.get(id)!.zh).some((p) => senses.has(p))).toBe(false);
      }
    }
  });

  it('does not reuse a word across a round', () => {
    const ids = qs.flatMap((q) => q.answer);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns nothing before any word is learned', () => {
    expect(makeQuestions(builtinWords(), 10)).toEqual([]);
  });
});

describe('exam plan', () => {
  const now = new Date(2026, 9, 23, 10).getTime();
  it('works out the daily pace that finishes two weeks early', () => {
    const p = examPlan('2026-12-31', now, 1000, 20)!;
    expect(p.daysLeft).toBe(69);
    expect(p.needed).toBe(Math.ceil(1000 / 55));
    expect(p.onTrack).toBe(true);
    expect(examPlan('2026-11-30', now, 1000, 20)!.onTrack).toBe(false);
  });
  it('handles a finished list and a bad date', () => {
    expect(examPlan('2026-12-31', now, 0, 20)).toMatchObject({ needed: 0, finishAt: null, onTrack: true });
    expect(examPlan('not a date', now, 10, 20)).toBeNull();
  });
});
