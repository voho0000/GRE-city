import { ROOTS } from '../data/roots';

export interface RootPart {
  morph: string;
  meaning: string;
}

export interface RootInfo {
  parts: RootPart[];
  note: string;
}

export function parseParts(parts: string): RootPart[] {
  return parts
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      return i < 0 ? { morph: p, meaning: '' } : { morph: p.slice(0, i).trim(), meaning: p.slice(i + 1).trim() };
    });
}

/** The word's own root breakdown or origin story, or null when none is known. */
export function rootsFor(id: string): RootInfo | null {
  const entry = ROOTS[id];
  if (!entry || (!entry[0] && !entry[1])) return null;
  return { parts: parseParts(entry[0]), note: entry[1] };
}
