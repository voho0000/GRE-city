import type { DistrictId, LogEntry, Rating, Settings, Srs, Word } from './types';

/** Everything that travels between devices. */
export interface SyncData {
  words: Word[];
  logs: LogEntry[];
  settings: Settings;
  /** Word id → time it was deleted. */
  deleted: Record<string, number>;
}

const RATINGS: Rating[] = ['again', 'hard', 'good'];

const logKey = (l: LogEntry) => `${l.at}|${l.wordId}|${l.rating}`;
const srsTime = (s: Srs | null) => (s ? s.lastAt : -1);

/**
 * Merges two devices' data word by word: each word keeps the most recent answer (srs) and the most recent
 * edit, logs are the union of both sides, and a deletion wins unless the word was touched again afterwards.
 */
export function mergeData(a: SyncData, b: SyncData): SyncData {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, at);

  const byId = new Map<string, Word>();
  for (const w of a.words) byId.set(w.id, w);
  for (const w of b.words) {
    const mine = byId.get(w.id);
    if (!mine) {
      byId.set(w.id, w);
      continue;
    }
    const base = (w.editedAt ?? 0) > (mine.editedAt ?? 0) ? w : mine;
    const srs = srsTime(w.srs) > srsTime(mine.srs) ? w.srs : mine.srs;
    byId.set(w.id, { ...base, srs });
  }
  const words = [...byId.values()].filter((w) => {
    const gone = deleted[w.id];
    return gone === undefined || gone < Math.max(w.editedAt ?? 0, srsTime(w.srs));
  });

  const logs = new Map<string, LogEntry>();
  for (const l of [...a.logs, ...b.logs]) {
    const key = logKey(l);
    if (!logs.has(key)) logs.set(key, { at: l.at, wordId: l.wordId, rating: l.rating, isNew: l.isNew, levelBefore: l.levelBefore, levelAfter: l.levelAfter });
  }

  const newer = (b.settings.updatedAt ?? 0) > (a.settings.updatedAt ?? 0) ? b.settings : a.settings;
  return {
    words: words.sort((x, y) => x.order - y.order),
    logs: [...logs.values()].sort((x, y) => x.at - y.at),
    settings: { ...newer, onboarded: a.settings.onboarded || b.settings.onboarded },
    deleted,
  };
}

/** What changed locally after a merge, so it can be applied without overwriting concurrent edits. */
export function diffLocal(local: SyncData, merged: SyncData) {
  const before = new Map(local.words.map((w) => [w.id, JSON.stringify(w)]));
  const after = new Set(merged.words.map((w) => w.id));
  const localLogs = new Set(local.logs.map(logKey));
  return {
    putWords: merged.words.filter((w) => before.get(w.id) !== JSON.stringify(w)),
    removeIds: local.words.filter((w) => !after.has(w.id)).map((w) => w.id),
    addLogs: merged.logs.filter((l) => !localLogs.has(logKey(l))),
    settings: JSON.stringify(local.settings) !== JSON.stringify(merged.settings) ? merged.settings : null,
    deleted: JSON.stringify(local.deleted) !== JSON.stringify(merged.deleted) ? merged.deleted : null,
  };
}

/* Compact file format: a few thousand words and tens of thousands of answers stay well under a megabyte or two. */

type WordRow = [string, string, string, string, string, DistrictId, number, 0 | 1, number, (number[] | 0)?, string?];
type LogRow = [number, string, number, 0 | 1, number, number];

export const FILE_NAME = 'gre-city.json';

export function encode(d: SyncData, now = Date.now()): string {
  const words: WordRow[] = d.words.map((w) => {
    const row: WordRow = [w.id, w.word, w.zh, w.pos, w.example, w.district, w.order, w.source === 'import' ? 1 : 0, w.editedAt ?? 0];
    if (w.srs || w.kk) row.push(w.srs ? [w.srs.level, w.srs.due, w.srs.lapses, w.srs.reps, w.srs.introducedAt, w.srs.lastAt] : 0);
    if (w.kk) row.push(w.kk);
    return row;
  });
  const logs: LogRow[] = d.logs.map((l) => [l.at, l.wordId, RATINGS.indexOf(l.rating), l.isNew ? 1 : 0, l.levelBefore, l.levelAfter]);
  return JSON.stringify({ app: 'gre-city', v: 1, savedAt: now, settings: d.settings, deleted: d.deleted, words, logs });
}

export function decode(text: string): SyncData {
  const raw = JSON.parse(text);
  if (raw?.app !== 'gre-city' || raw.v !== 1 || !Array.isArray(raw.words) || !Array.isArray(raw.logs)) throw new Error('not a GRE City sync file');
  const words: Word[] = (raw.words as WordRow[]).map(([id, word, zh, pos, example, district, order, source, editedAt, s, kk]) => ({
    id, word, zh, pos, example, district, order,
    source: source ? 'import' : 'builtin',
    srs: s ? { level: s[0], due: s[1], lapses: s[2], reps: s[3], introducedAt: s[4], lastAt: s[5] } : null,
    ...(editedAt ? { editedAt } : {}),
    ...(kk ? { kk } : {}),
  }));
  const logs: LogEntry[] = (raw.logs as LogRow[]).map(([at, wordId, r, isNew, levelBefore, levelAfter]) => ({
    at, wordId, rating: RATINGS[r] ?? 'good', isNew: !!isNew, levelBefore, levelAfter,
  }));
  return { words, logs, settings: raw.settings, deleted: raw.deleted ?? {} };
}

/* GitHub API */

export class SyncError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    });
  } catch {
    throw new SyncError('連不上 GitHub，請檢查網路');
  }
  if (res.status === 401) throw new SyncError('token 無效或已過期，請重新連結', 401);
  if (res.status === 403 || res.status === 404) throw new SyncError('token 沒有 gist 權限，或找不到同步用的 Gist', res.status);
  if (!res.ok) throw new SyncError(`GitHub 回應錯誤（${res.status}）`, res.status);
  return res.json() as Promise<T>;
}

interface GistFile { content?: string; truncated?: boolean; raw_url?: string }
interface Gist { id: string; html_url: string; files: Record<string, GistFile> }

export async function whoAmI(token: string): Promise<string> {
  return (await gh<{ login: string }>(token, '/user')).login;
}

/** Finds the user's existing sync Gist, if any. */
export async function findGist(token: string): Promise<Gist | null> {
  for (let page = 1; page <= 10; page++) {
    const list = await gh<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const hit = list.find((g) => FILE_NAME in g.files);
    if (hit) return hit;
    if (list.length < 100) return null;
  }
  return null;
}

export async function createGist(token: string, content: string): Promise<Gist> {
  return gh<Gist>(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: '字城 GRE City 同步資料', public: false, files: { [FILE_NAME]: { content } } }),
  });
}

export async function readGist(token: string, id: string): Promise<string | null> {
  const gist = await gh<Gist>(token, `/gists/${id}`);
  const file = gist.files[FILE_NAME];
  if (!file) return null;
  if (!file.truncated && file.content !== undefined) return file.content;
  try {
    const res = await fetch(file.raw_url!);
    if (!res.ok) throw new Error();
    return await res.text();
  } catch {
    throw new SyncError('同步檔太大，讀取失敗');
  }
}

export async function writeGist(token: string, id: string, content: string): Promise<void> {
  await gh(token, `/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE_NAME]: { content } } }) });
}

/* Per-device connection, kept out of the synced data. */

export interface SyncConfig {
  token: string;
  gistId: string;
  login: string;
  gistUrl: string;
  lastAt: number | null;
}

const CONFIG_KEY = 'gre-city-sync';

export function loadConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SyncConfig | null): void {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    // Private mode: sync simply stays off on this device.
  }
}
