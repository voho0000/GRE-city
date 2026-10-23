import { meaningParts, sharedSenses } from './synonyms';
import type { Word } from './types';

/** One sentence-equivalence style question: pick the two words that mean the same thing. */
export interface Question {
  answer: [string, string];
  options: string[];
  sense: string;
}

export const OPTION_COUNT = 6;

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Builds questions from synonym pairs, preferring pairs where both words are already built (learned) so practice
 * reinforces the city, then pairs with one learned word. Distractors never share a sense with either answer;
 * two of them come from the target's district, where the meanings are closest and the choice is hardest.
 */
export function makeQuestions(words: Word[], count: number, rand: () => number = Math.random): Question[] {
  const learned = (w: Word) => !!w.srs;
  const bySense = new Map<string, Word[]>();
  for (const w of words) for (const p of meaningParts(w.zh)) bySense.set(p, [...(bySense.get(p) ?? []), w]);

  const pairs: { a: Word; b: Word; score: number }[] = [];
  const seen = new Set<string>();
  for (const group of bySense.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const key = [a.id, b.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const score = Number(learned(a)) + Number(learned(b));
        if (score > 0) pairs.push({ a, b, score });
      }
  }
  const ordered = [...shuffle(pairs.filter((p) => p.score === 2), rand), ...shuffle(pairs.filter((p) => p.score === 1), rand)];

  const out: Question[] = [];
  const used = new Set<string>();
  for (const { a, b } of ordered) {
    if (out.length >= count) break;
    if (used.has(a.id) || used.has(b.id)) continue;
    const senses = new Set([...meaningParts(a.zh), ...meaningParts(b.zh)]);
    const ok = (w: Word) => w.id !== a.id && w.id !== b.id && !meaningParts(w.zh).some((p) => senses.has(p));
    const near = shuffle(words.filter((w) => ok(w) && w.district === a.district), rand).slice(0, 2);
    const nearIds = new Set(near.map((w) => w.id));
    const far = shuffle(words.filter((w) => ok(w) && !nearIds.has(w.id) && learned(w)), rand);
    const rest = far.length >= OPTION_COUNT - 2 - near.length ? far : shuffle(words.filter((w) => ok(w) && !nearIds.has(w.id)), rand);
    const distractors = [...near, ...rest].slice(0, OPTION_COUNT - 2);
    if (distractors.length < OPTION_COUNT - 2) continue;
    used.add(a.id);
    used.add(b.id);
    out.push({ answer: [a.id, b.id], options: shuffle([a.id, b.id, ...distractors.map((w) => w.id)], rand), sense: sharedSenses(a, b)[0] ?? '' });
  }
  return out;
}

/** Deterministic random numbers for tests and for a stable question set. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
