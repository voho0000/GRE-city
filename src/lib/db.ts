import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { builtinWords } from '../data/seed';
import { DEFAULT_SETTINGS, type LogEntry, type Settings, type Word } from './types';

interface CityDB extends DBSchema {
  words: { key: string; value: Word };
  logs: { key: number; value: LogEntry; indexes: { at: number } };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<CityDB>> | null = null;

function db() {
  dbPromise ??= openDB<CityDB>('gre-city', 1, {
    upgrade(d) {
      d.createObjectStore('words', { keyPath: 'id' });
      d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true }).createIndex('at', 'at');
      d.createObjectStore('meta');
    },
  });
  return dbPromise;
}

export interface Snapshot {
  words: Word[];
  logs: LogEntry[];
  settings: Settings;
  /** Word id → when it was deleted, so a sync does not bring it back. */
  deleted: Record<string, number>;
}

export async function loadAll(): Promise<Snapshot> {
  const d = await db();
  if (!(await d.get('meta', 'seeded'))) {
    const tx = d.transaction(['words', 'meta'], 'readwrite');
    for (const w of builtinWords()) await tx.objectStore('words').put(w);
    await tx.objectStore('meta').put(true, 'seeded');
    await tx.objectStore('meta').put(BUILTIN_VERSION, 'builtinVersion');
    await tx.done;
  }
  const [words, logs, settings, deleted] = await Promise.all([d.getAll('words'), d.getAll('logs'), d.get('meta', 'settings'), d.get('meta', 'deleted')]);
  if (((await d.get('meta', 'builtinVersion')) as number | undefined ?? 1) < BUILTIN_VERSION) {
    await upgradeBuiltins(words, (deleted as Record<string, number> | undefined) ?? {});
    await d.put('meta', BUILTIN_VERSION, 'builtinVersion');
  }
  return {
    words,
    logs,
    settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) },
    deleted: (deleted as Record<string, number> | undefined) ?? {},
  };
}

/** Bumped whenever the built-in list changes, so existing cities pick up the new version once. */
const BUILTIN_VERSION = 3;

/**
 * Brings a city started on an older built-in list up to date, in place: adds new words (after the ones
 * already queued), fills in KK phonetics, and moves built-in words still sitting in the dock to the district
 * the list now gives them. Progress, and anything the learner edited or deleted, is left alone.
 */
async function upgradeBuiltins(words: Word[], deleted: Record<string, number>): Promise<void> {
  const byId = new Map(words.map((w) => [w.id, w]));
  let order = words.reduce((m, w) => Math.max(m, w.order), -1) + 1;
  const changed: Word[] = [];
  for (const b of builtinWords()) {
    const mine = byId.get(b.id);
    if (!mine) {
      if (deleted[b.id] !== undefined) continue;
      const added = { ...b, order: order++ };
      words.push(added);
      changed.push(added);
      continue;
    }
    let next = mine;
    if (!mine.kk && b.kk) next = { ...next, kk: b.kk };
    if (mine.source === 'builtin' && !mine.editedAt && mine.district === 'dock' && b.district !== 'dock') next = { ...next, district: b.district };
    if (next !== mine) {
      words[words.indexOf(mine)] = next;
      changed.push(next);
    }
  }
  if (changed.length) await putWords(changed);
}

export async function putWords(words: Word[]): Promise<void> {
  const tx = (await db()).transaction('words', 'readwrite');
  await Promise.all([...words.map((w) => tx.store.put(w)), tx.done]);
}

export async function deleteWords(ids: string[], deleted: Record<string, number>): Promise<void> {
  const tx = (await db()).transaction(['words', 'meta'], 'readwrite');
  await Promise.all([...ids.map((id) => tx.objectStore('words').delete(id)), tx.objectStore('meta').put(deleted, 'deleted'), tx.done]);
}

export async function saveDeleted(deleted: Record<string, number>): Promise<void> {
  await (await db()).put('meta', deleted, 'deleted');
}

export async function addLogs(entries: LogEntry[]): Promise<number[]> {
  const tx = (await db()).transaction('logs', 'readwrite');
  const ids = await Promise.all(entries.map((e) => tx.store.add(e)));
  await tx.done;
  return ids;
}

export async function addLog(entry: LogEntry): Promise<number> {
  return (await db()).add('logs', entry);
}

export async function deleteLog(id: number): Promise<void> {
  await (await db()).delete('logs', id);
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).put('meta', s, 'settings');
}

export async function replaceAll(snap: Snapshot): Promise<void> {
  const d = await db();
  const tx = d.transaction(['words', 'logs', 'meta'], 'readwrite');
  await tx.objectStore('words').clear();
  await tx.objectStore('logs').clear();
  for (const w of snap.words) await tx.objectStore('words').put(w);
  for (const l of snap.logs) await tx.objectStore('logs').put(l);
  await tx.objectStore('meta').put(snap.settings, 'settings');
  await tx.objectStore('meta').put(snap.deleted ?? {}, 'deleted');
  await tx.objectStore('meta').put(true, 'seeded');
  await tx.done;
}
