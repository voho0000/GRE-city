import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { KK } from '../data/kk';
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
    await tx.done;
  }
  const [words, logs, settings, deleted] = await Promise.all([d.getAll('words'), d.getAll('logs'), d.get('meta', 'settings'), d.get('meta', 'deleted')]);
  // Cities started before KK phonetics existed get them filled in for the built-in words.
  const missingKK = words.filter((w) => !w.kk && KK[w.id]);
  if (missingKK.length) {
    for (const w of missingKK) w.kk = KK[w.id];
    await putWords(missingKK);
  }
  return {
    words,
    logs,
    settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) },
    deleted: (deleted as Record<string, number> | undefined) ?? {},
  };
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
