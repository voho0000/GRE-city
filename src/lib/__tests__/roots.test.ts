import { describe, expect, it } from 'vitest';
import { parseParts } from '../roots';

describe('parseParts', () => {
  it('splits a breakdown into parts and meanings', () => {
    expect(parseParts('pre=在前+varic=跨開腳、走歪+ate=動詞字尾')).toEqual([
      { morph: 'pre', meaning: '在前' },
      { morph: 'varic', meaning: '跨開腳、走歪' },
      { morph: 'ate', meaning: '動詞字尾' },
    ]);
  });
  it('handles empty input and parts without a meaning', () => {
    expect(parseParts('')).toEqual([]);
    expect(parseParts('loqu')).toEqual([{ morph: 'loqu', meaning: '' }]);
  });
});

describe('built-in roots', () => {
  it('covers most built-in words, every entry well formed', async () => {
    const { ROOTS } = await import('../../data/roots');
    const { builtinWords } = await import('../../data/seed');
    const ids = new Set(builtinWords().map((w) => w.id));
    const entries = Object.entries(ROOTS);
    expect(entries.length).toBeGreaterThan(1300);
    for (const [id, [parts]] of entries) {
      expect(ids.has(id)).toBe(true);
      for (const p of parseParts(parts)) {
        expect(p.morph).not.toBe('');
        expect(p.meaning).not.toBe('');
      }
    }
  });
});
