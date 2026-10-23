import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from './db';
import { applyRating, type RatingResult } from './srs';
import { DEFAULT_SETTINGS, type DistrictId, type LogEntry, type Rating, type Settings, type Word } from './types';
import type { ParsedRow } from './csv';

interface Store {
  ready: boolean;
  words: Word[];
  byId: Map<string, Word>;
  logs: LogEntry[];
  settings: Settings;
  rate: (id: string, rating: Rating) => Promise<RatingResult>;
  importRows: (rows: ParsedRow[]) => Promise<{ added: number; skipped: number }>;
  moveWord: (id: string, district: DistrictId) => Promise<void>;
  removeWord: (id: string) => Promise<void>;
  setSettings: (s: Settings) => Promise<void>;
  exportBackup: () => db.Snapshot;
  restoreBackup: (snap: db.Snapshot) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<db.Snapshot | null>(null);

  useEffect(() => {
    db.loadAll().then(setSnap);
  }, []);

  const words = snap?.words ?? [];
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);

  const updateWords = useCallback((changed: Word[]) => {
    const map = new Map(changed.map((w) => [w.id, w]));
    setSnap((s) => {
      if (!s) return s;
      const ids = new Set(s.words.map((w) => w.id));
      const next = s.words.map((w) => map.get(w.id) ?? w);
      for (const w of changed) if (!ids.has(w.id)) next.push(w);
      return { ...s, words: next };
    });
  }, []);

  const rate = useCallback(
    async (id: string, rating: Rating) => {
      const word = byId.get(id);
      if (!word) throw new Error(`unknown word ${id}`);
      const now = Date.now();
      const result = applyRating(word.srs, rating, now);
      const next = { ...word, srs: result.srs };
      const entry: LogEntry = { at: now, wordId: id, rating, isNew: result.isNew, levelBefore: result.levelBefore, levelAfter: result.levelAfter };
      updateWords([next]);
      await db.putWords([next]);
      entry.id = await db.addLog(entry);
      setSnap((s) => (s ? { ...s, logs: [...s.logs, entry] } : s));
      return result;
    },
    [byId, updateWords],
  );

  const importRows = useCallback(
    async (rows: ParsedRow[]) => {
      let order = words.reduce((m, w) => Math.max(m, w.order), -1) + 1;
      const seen = new Set(words.map((w) => w.id));
      const added: Word[] = [];
      for (const r of rows) {
        const id = r.word.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        added.push({ id, word: r.word, zh: r.zh, pos: r.pos, example: r.example, district: r.district, order: order++, source: 'import', srs: null });
      }
      await db.putWords(added);
      updateWords(added);
      return { added: added.length, skipped: rows.length - added.length };
    },
    [words, updateWords],
  );

  const moveWord = useCallback(
    async (id: string, district: DistrictId) => {
      const w = byId.get(id);
      if (!w) return;
      const next = { ...w, district };
      updateWords([next]);
      await db.putWords([next]);
    },
    [byId, updateWords],
  );

  const removeWord = useCallback(async (id: string) => {
    setSnap((s) => (s ? { ...s, words: s.words.filter((w) => w.id !== id) } : s));
    await db.deleteWord(id);
  }, []);

  const setSettings = useCallback(async (settings: Settings) => {
    setSnap((s) => (s ? { ...s, settings } : s));
    await db.saveSettings(settings);
  }, []);

  const restoreBackup = useCallback(async (next: db.Snapshot) => {
    await db.replaceAll(next);
    setSnap(await db.loadAll());
  }, []);

  const value: Store = {
    ready: !!snap,
    words,
    byId,
    logs: snap?.logs ?? [],
    settings: snap?.settings ?? DEFAULT_SETTINGS,
    rate,
    importRows,
    moveWord,
    removeWord,
    setSettings,
    exportBackup: () => snap!,
    restoreBackup,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
