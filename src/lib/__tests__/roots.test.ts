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
