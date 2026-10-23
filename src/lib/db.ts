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
}

export async function loadAll(): Promise<Snapshot> {
  const d = await db();
  if (!(await d.get('meta', 'seeded'))) {
    const tx = d.transaction(['words', 'meta'], 'readwrite');
    for (const w of builtinWords()) await tx.objectStore('words').put(w);
    await tx.objectStore('meta').put(true, 'seeded');
    await tx.done;
  }
  const [words, logs, settings] = await Promise.all([d.getAll('words'), d.getAll('logs'), d.get('meta', 'settings')]);
  return { words, logs, settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) } };
}

export async function putWords(words: Word[]): Promise<void> {
  const tx = (await db()).transaction('words', 'readwrite');
  await Promise.all([...words.map((w) => tx.store.put(w)), tx.done]);
}

export async function deleteWord(id: string): Promise<void> {
  await (await db()).delete('words', id);
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
  await tx.objectStore('meta').put(true, 'seeded');
  await tx.done;
}
