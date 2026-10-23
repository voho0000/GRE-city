import { describe, expect, it } from 'vitest';
import { parseWordList, splitRows } from '../csv';
import { suggestDistrict } from '../assign';

describe('splitRows', () => {
  it('handles quoted fields with commas, escaped quotes and CRLF', () => {
    expect(splitRows('a,"b, c","say ""hi"""\r\nd,e,f\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });

  it('detects tab-separated text pasted from a spreadsheet', () => {
    expect(splitRows('word\tzh\nlaud\t讚美')).toEqual([['word', 'zh'], ['laud', '讚美']]);
  });
});

describe('parseWordList', () => {
  it('reads headerless rows as word, zh, pos, example', () => {
    const rows = parseWordList('garrulous,喋喋不休的,adj.,He was garrulous.');
    expect(rows).toEqual([{ word: 'garrulous', zh: '喋喋不休的', pos: 'adj.', kk: '', example: 'He was garrulous.', district: 'speech' }]);
  });

  it('maps columns by header, in any order, and honours a district column', () => {
    const rows = parseWordList('中文,word,街區\n多話的,chatty,言談\n奇怪,odd,');
    expect(rows[0]).toMatchObject({ word: 'chatty', zh: '多話的', district: 'speech' });
    expect(rows[1]).toMatchObject({ word: 'odd', zh: '奇怪', district: 'dock' });
  });

  it('skips rows that are not English words', () => {
    expect(parseWordList('123,數字\n,空白\nok,好')).toHaveLength(1);
  });
});

describe('suggestDistrict', () => {
  it('matches roots first, then the Chinese meaning, else the dock', () => {
    expect(suggestDistrict('veracious', '誠實的')).toBe('truth');
    expect(suggestDistrict('bellicose', '')).toBe('conflict');
    expect(suggestDistrict('blather', '胡說')).toBe('speech');
    expect(suggestDistrict('zephyr', '微風')).toBe('dock');
  });
});

describe('kk column', () => {
  it('reads KK phonetics and strips surrounding brackets or slashes', () => {
    const rows = parseWordList('word,zh,kk\nloquacious,多話的,[loˋkweʃəs]\nterse,簡短的,/tɝs/\nlaud,讚美,');
    expect(rows.map((r) => r.kk)).toEqual(['loˋkweʃəs', 'tɝs', '']);
  });
});
