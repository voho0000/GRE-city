import { districtFromLabel } from '../data/districts';
import { suggestDistrict } from './assign';
import type { DistrictId } from './types';

export interface ParsedRow {
  word: string;
  zh: string;
  pos: string;
  example: string;
  district: DistrictId;
}

/** Splits CSV or TSV text into rows, honouring double-quoted fields. */
export function splitRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

const HEADERS: Record<keyof ParsedRow, string[]> = {
  word: ['word', 'term', '單字', '英文'],
  zh: ['zh', 'chinese', 'meaning', 'definition', '中文', '意思', '解釋'],
  pos: ['pos', 'part', '詞性'],
  example: ['example', 'sentence', '例句'],
  district: ['district', 'root', 'theme', '街區', '分區', '主題'],
};

export function parseWordList(text: string): ParsedRow[] {
  const rows = splitRows(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.toLowerCase());
  const col: Record<keyof ParsedRow, number> = { word: 0, zh: 1, pos: 2, example: 3, district: 4 };
  const hasHeader = head.some((h) => HEADERS.word.includes(h));
  if (hasHeader) {
    for (const key of Object.keys(HEADERS) as (keyof ParsedRow)[]) col[key] = head.findIndex((h) => HEADERS[key].includes(h));
  }
  const out: ParsedRow[] = [];
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const get = (k: keyof ParsedRow) => (col[k] >= 0 ? r[col[k]] ?? '' : '');
    const word = get('word');
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(word)) continue;
    const zh = get('zh');
    out.push({
      word,
      zh,
      pos: get('pos'),
      example: get('example'),
      district: districtFromLabel(get('district')) ?? suggestDistrict(word, zh),
    });
  }
  return out;
}
