import { THESAURUS } from '../data/thesaurus';
import type { Word } from './types';

export interface Related {
  text: string;
  /** The word is in the user's own list, so it can come back as an SE partner. */
  known: boolean;
}

export interface Thesaurus {
  synonyms: Related[];
  antonyms: Related[];
}

const split = (s: string | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Curated synonyms and antonyms, plus words from the list that share a sense with this one. Words the user is
 * also learning come first, since those are the pairs they will meet again in practice.
 */
export function thesaurusFor(word: Word, sameSense: Word[], known: Set<string>, max = 6): Thesaurus {
  const [syn, ant] = (THESAURUS[word.id] ?? '|').split('|');
  const self = word.id;
  const pack = (list: string[]) => {
    const seen = new Set<string>([self]);
    const out: Related[] = [];
    for (const text of list) {
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, known: known.has(key) });
    }
    return [...out.filter((r) => r.known), ...out.filter((r) => !r.known)].slice(0, max);
  };
  return { synonyms: pack([...split(syn), ...sameSense.map((w) => w.word)]), antonyms: pack(split(ant)) };
}
