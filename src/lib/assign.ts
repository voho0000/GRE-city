import { DISTRICTS } from '../data/districts';
import type { DistrictId } from './types';

/** Suggest a district from word stems first, then the Chinese meaning. */
export function suggestDistrict(word: string, zh: string): DistrictId {
  const w = word.toLowerCase();
  for (const d of DISTRICTS) if (d.roots.some((r) => r.test(w))) return d.id;
  for (const d of DISTRICTS) if (d.zh.some((k) => zh.includes(k))) return d.id;
  return 'dock';
}
