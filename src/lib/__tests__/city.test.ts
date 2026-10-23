import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '../../data/districts';
import { builtinWords } from '../../data/seed';
import { buildingParts, layoutCity } from '../city';
import { addDays } from '../time';
import type { Word } from '../types';

const NOW = new Date(2026, 9, 23, 10, 0).getTime();

function learned(words: Word[], n: number): Word[] {
  return words.map((w, i) => (i < n ? { ...w, srs: { level: i % 6, due: addDays(NOW, 1), lapses: 0, reps: 1, introducedAt: NOW - (n - i), lastAt: NOW } } : w));
}

describe('layoutCity', () => {
  it('places one building per learned word and none for unlearned words', () => {
    const words = learned(builtinWords(), 40);
    const city = layoutCity(words, NOW);
    expect(city.buildings).toHaveLength(40);
    expect(city.blocks).toHaveLength(DISTRICTS.length);
  });

  it('never puts two buildings on the same tile, even with thousands of words', () => {
    const base = builtinWords();
    const many: Word[] = Array.from({ length: 3500 }, (_, i) => ({ ...base[i % base.length], id: `w${i}`, order: i }));
    const city = layoutCity(learned(many, 3500), NOW);
    const spots = new Set(city.buildings.map((b) => `${b.cx},${b.cy}`));
    expect(spots.size).toBe(3500);
  });

  it('paints buildings back to front', () => {
    const city = layoutCity(learned(builtinWords(), 60), NOW);
    for (let i = 1; i < city.buildings.length; i++) expect(city.buildings[i].depth).toBeGreaterThanOrEqual(city.buildings[i - 1].depth);
  });
});

describe('buildingParts', () => {
  it('draws a distinct building type at every level', () => {
    const shapes = [0, 1, 2, 3, 4, 5].map((lv) => buildingParts(0, 0, lv, 'none', '#D9822B').map((p) => p.d).join('|'));
    expect(new Set(shapes).size).toBe(6);
    for (const s of shapes) expect(s).not.toMatch(/NaN|undefined/);
  });

  it('adds weeds to an overgrown building', () => {
    const fresh = buildingParts(0, 0, 3, 'none', '#D9822B');
    const overgrown = buildingParts(0, 0, 3, 'weeds', '#D9822B');
    expect(overgrown.length).toBeGreaterThan(fresh.length);
  });
});

describe('builtinWords', () => {
  it('has unique ids and a known district for every word', () => {
    const words = builtinWords();
    expect(words).toHaveLength(1200);
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    expect(words.every((w) => w.zh && w.district)).toBe(true);
  });

  it('has KK phonetics for every built-in word, each with a stress mark when longer than one syllable', () => {
    const words = builtinWords();
    expect(words.filter((w) => !w.kk).map((w) => w.id)).toEqual([]);
    const vowels = /[aeiouæɑɔəɛɪʊʌɝɚḷṇ]+/g;
    const multi = words.filter((w) => (w.kk!.match(vowels) ?? []).length > 1 && !w.kk!.includes('ˋ'));
    expect(multi.map((w) => w.id)).toEqual([]);
  });
});
