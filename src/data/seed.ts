import type { DistrictId, Word } from '../lib/types';
import { BUILTIN } from './builtin';
import { EXAMPLES } from './examples';

export function builtinWords(): Word[] {
  const seen = new Set<string>();
  const out: Word[] = [];
  // Interleave districts so the first days already spread buildings across the island.
  const lists = (Object.keys(BUILTIN) as DistrictId[]).map((district) =>
    BUILTIN[district]
      .trim()
      .split('\n')
      .map((line) => {
        const [word, zh, pos, kk] = line.split('|');
        return { word: word.trim(), zh: (zh ?? '').trim(), pos: (pos ?? '').trim(), kk: (kk ?? '').trim(), district };
      }),
  );
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const row = list[i];
      if (!row || seen.has(row.word.toLowerCase())) continue;
      seen.add(row.word.toLowerCase());
      out.push({ id: row.word.toLowerCase(), word: row.word, zh: row.zh, pos: row.pos, kk: row.kk || undefined, example: EXAMPLES[row.word.toLowerCase()]?.[0] ?? '', exampleZh: EXAMPLES[row.word.toLowerCase()]?.[1], district: row.district, order: out.length, source: 'builtin', srs: null });
    }
  }
  return out;
}
