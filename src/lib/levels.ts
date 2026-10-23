import { DISTRICT_BY_ID } from '../data/districts';
import type { Word } from './types';

export const LEVEL_NAMES = ['地基', '小屋', '連棟屋', '公寓', '塔樓', '地標'];

export function daysLabel(days: number): string {
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  return `${days} 天後`;
}

/** Locates the district root inside the word, for highlighting on the card. */
export function rootSpan(word: Word): [number, number] | null {
  const lower = word.word.toLowerCase();
  for (const r of DISTRICT_BY_ID[word.district].roots) {
    const m = r.exec(lower);
    if (m) return [m.index, m.index + m[0].length];
  }
  return null;
}
