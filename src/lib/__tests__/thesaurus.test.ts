import { describe, expect, it } from 'vitest';
import { thesaurusFor } from '../thesaurus';
import { builtinWords } from '../../data/seed';
import { THESAURUS } from '../../data/thesaurus';

const words = builtinWords();
const byId = new Map(words.map((w) => [w.id, w]));
const known = new Set(byId.keys());

describe('thesaurusFor', () => {
  it('puts words from the list first, adds same-sense words and drops duplicates and the word itself', () => {
    const w = byId.get('loquacious')!;
    const t = thesaurusFor(w, [byId.get('garrulous')!, w], known);
    const texts = t.synonyms.map((r) => r.text.toLowerCase());
    expect(texts).toContain('garrulous');
    expect(texts).not.toContain('loquacious');
    expect(new Set(texts).size).toBe(texts.length);
    const firstUnknown = t.synonyms.findIndex((r) => !r.known);
    if (firstUnknown >= 0) expect(t.synonyms.slice(firstUnknown).every((r) => !r.known)).toBe(true);
  });
});

describe('built-in thesaurus', () => {
  it('covers every built-in word with well-formed entries', () => {
    for (const w of words) {
      const entry = THESAURUS[w.id];
      expect(entry, w.id).toBeDefined();
      const [syn, ant] = entry.split('|');
      expect(syn.split(',').filter(Boolean).length, w.id).toBeGreaterThanOrEqual(1);
      for (const x of [...syn.split(','), ...(ant ?? '').split(',')].filter(Boolean)) expect(x).toMatch(/^[A-Za-z][A-Za-z' -]*$/);
    }
  });
});
