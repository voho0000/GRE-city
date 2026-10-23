import type { Word } from './types';

/** Splits a Chinese gloss into its separate senses: "易變的、不穩定的" → ["易變的", "不穩定的"]. */
export function meaningParts(zh: string): string[] {
  return zh
    .replace(/[（(][^）)]*[）)]/g, '')
    .split(/[、；;，,／/]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Words that share at least one sense with each other. The built-in glosses are written consistently, so a
 * shared sense is a good stand-in for "these two would both fit the same blank" in sentence equivalence.
 */
export function buildSynonymIndex(words: Word[]): Map<string, string[]> {
  const bySense = new Map<string, string[]>();
  for (const w of words) for (const p of meaningParts(w.zh)) bySense.set(p, [...(bySense.get(p) ?? []), w.id]);
  const out = new Map<string, string[]>();
  for (const w of words) {
    const set = new Set<string>();
    for (const p of meaningParts(w.zh)) for (const id of bySense.get(p) ?? []) if (id !== w.id) set.add(id);
    if (set.size) out.set(w.id, [...set]);
  }
  return out;
}

/** Senses shared by every word in a group: what a synonym pair has in common. */
export function sharedSenses(a: Word, b: Word): string[] {
  const other = new Set(meaningParts(b.zh));
  return meaningParts(a.zh).filter((p) => other.has(p));
}
