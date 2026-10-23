import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from './db';
import { applyRating, type RatingResult } from './srs';
import * as sync from './sync';
import { DEFAULT_SETTINGS, type DistrictId, type LogEntry, type Rating, type Settings, type Word } from './types';
import type { ParsedRow } from './csv';

export interface SyncState {
  config: sync.SyncConfig | null;
  status: 'off' | 'idle' | 'syncing' | 'error';
  error: string | null;
}

interface Store {
  ready: boolean;
  words: Word[];
  byId: Map<string, Word>;
  logs: LogEntry[];
  settings: Settings;
  rate: (id: string, rating: Rating) => Promise<RatingResult>;
  /** Reverts the most recent rating made on this device; false when there is nothing to undo. */
  undoLastRating: () => Promise<boolean>;
  importRows: (rows: ParsedRow[]) => Promise<{ added: number; skipped: number }>;
  moveWord: (id: string, district: DistrictId) => Promise<void>;
  removeWord: (id: string) => Promise<void>;
  setSettings: (patch: Partial<Omit<Settings, 'updatedAt'>>) => Promise<void>;
  exportBackup: () => db.Snapshot;
  restoreBackup: (snap: db.Snapshot) => Promise<void>;
  sync: SyncState;
  connectSync: (token: string) => Promise<void>;
  disconnectSync: () => void;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** Upload this long after the last answer, so a study session becomes one sync instead of fifty. */
const SYNC_DEBOUNCE_MS = 30_000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<db.Snapshot | null>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const [syncState, setSyncState] = useState<SyncState>(() => {
    const config = sync.loadConfig();
    return { config, status: config ? 'idle' : 'off', error: null };
  });
  const configRef = useRef(syncState.config);
  configRef.current = syncState.config;
  const syncing = useRef<Promise<void> | null>(null);
  const undoStack = useRef<{ before: Word; logId: number }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Pulls the Gist, merges it with this device, saves what changed here and uploads the result. */
  const runSync = useCallback(async (config: sync.SyncConfig) => {
    const local = snapRef.current;
    if (!local) return;
    setSyncState((s) => ({ ...s, status: 'syncing', error: null }));
    try {
      const remoteText = await sync.readGist(config.token, config.gistId);
      const merged = remoteText ? sync.mergeData(local, sync.decode(remoteText)) : local;
      const diff = sync.diffLocal(local, merged);
      if (diff.putWords.length) await db.putWords(diff.putWords);
      if (diff.removeIds.length || diff.deleted) await db.deleteWords(diff.removeIds, merged.deleted);
      const logIds = diff.addLogs.length ? await db.addLogs(diff.addLogs) : [];
      if (diff.settings) await db.saveSettings(diff.settings);
      setSnap((s) => {
        if (!s) return s;
        const put = new Map(diff.putWords.map((w) => [w.id, w]));
        const removed = new Set(diff.removeIds);
        const known = new Set(s.words.map((w) => w.id));
        const nextWords = s.words.filter((w) => !removed.has(w.id)).map((w) => put.get(w.id) ?? w);
        for (const w of diff.putWords) if (!known.has(w.id)) nextWords.push(w);
        return {
          words: nextWords,
          logs: [...s.logs, ...diff.addLogs.map((l, i) => ({ ...l, id: logIds[i] }))].sort((a, b) => a.at - b.at),
          settings: diff.settings ?? s.settings,
          deleted: merged.deleted,
        };
      });
      const out = sync.encode(merged);
      if (!remoteText || sync.encode(sync.decode(remoteText)) !== out) await sync.writeGist(config.token, config.gistId, out);
      const next = { ...config, lastAt: Date.now() };
      sync.saveConfig(next);
      setSyncState({ config: next, status: 'idle', error: null });
    } catch (e) {
      setSyncState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : '同步失敗' }));
    }
  }, []);

  const syncNow = useCallback(async () => {
    const config = configRef.current;
    if (!config) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // One sync at a time; a request during a sync runs once more right after it.
    while (syncing.current) await syncing.current;
    syncing.current = runSync(config).finally(() => (syncing.current = null));
    await syncing.current;
  }, [runSync]);

  const scheduleSync = useCallback(() => {
    if (!configRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [syncNow]);

  // Sync when the app opens and whenever it goes to the background (switching apps, closing the tab).
  const ready = !!snap;
  useEffect(() => {
    if (!ready) return;
    void syncNow();
    // Coming back pulls the other device's progress; leaving uploads answers still waiting on the debounce.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' || timer.current) void syncNow();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ready, syncNow]);

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
      undoStack.current = [...undoStack.current.slice(-19), { before: word, logId: entry.id }];
      scheduleSync();
      return result;
    },
    [byId, updateWords, scheduleSync],
  );

  const undoLastRating = useCallback(async () => {
    const last = undoStack.current.pop();
    if (!last) return false;
    // Stamp the restored progress as the newest answer so a sync that already uploaded the rating does not
    // bring it back. (A word that was new has no progress to stamp; that rare case can reappear after a sync.)
    const restored = last.before.srs ? { ...last.before, srs: { ...last.before.srs, lastAt: Date.now() } } : last.before;
    updateWords([restored]);
    await db.putWords([restored]);
    await db.deleteLog(last.logId);
    setSnap((s) => (s ? { ...s, logs: s.logs.filter((l) => l.id !== last.logId) } : s));
    scheduleSync();
    return true;
  }, [updateWords, scheduleSync]);

  const importRows = useCallback(
    async (rows: ParsedRow[]) => {
      let order = words.reduce((m, w) => Math.max(m, w.order), -1) + 1;
      const seen = new Set(words.map((w) => w.id));
      const now = Date.now();
      const added: Word[] = [];
      for (const r of rows) {
        const id = r.word.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        added.push({ id, word: r.word, zh: r.zh, pos: r.pos, ...(r.kk ? { kk: r.kk } : {}), example: r.example, district: r.district, order: order++, source: 'import', srs: null, editedAt: now });
      }
      await db.putWords(added);
      updateWords(added);
      scheduleSync();
      return { added: added.length, skipped: rows.length - added.length };
    },
    [words, updateWords, scheduleSync],
  );

  const moveWord = useCallback(
    async (id: string, district: DistrictId) => {
      const w = byId.get(id);
      if (!w) return;
      const next = { ...w, district, editedAt: Date.now() };
      updateWords([next]);
      await db.putWords([next]);
      scheduleSync();
    },
    [byId, updateWords, scheduleSync],
  );

  const removeWord = useCallback(
    async (id: string) => {
      const deleted = { ...(snapRef.current?.deleted ?? {}), [id]: Date.now() };
      setSnap((s) => (s ? { ...s, words: s.words.filter((w) => w.id !== id), deleted } : s));
      await db.deleteWords([id], deleted);
      scheduleSync();
    },
    [scheduleSync],
  );

  const setSettings = useCallback(
    async (patch: Partial<Omit<Settings, 'updatedAt'>>) => {
      const settings = { ...(snapRef.current?.settings ?? DEFAULT_SETTINGS), ...patch, updatedAt: Date.now() };
      setSnap((x) => (x ? { ...x, settings } : x));
      await db.saveSettings(settings);
      scheduleSync();
    },
    [scheduleSync],
  );

  const restoreBackup = useCallback(async (next: db.Snapshot) => {
    await db.replaceAll(next);
    setSnap(await db.loadAll());
  }, []);

  const connectSync = useCallback(
    async (token: string) => {
      const local = snapRef.current;
      if (!local) return;
      const t = token.trim();
      const login = await sync.whoAmI(t);
      const gist = (await sync.findGist(t)) ?? (await sync.createGist(t, sync.encode(local)));
      const config: sync.SyncConfig = { token: t, gistId: gist.id, gistUrl: gist.html_url, login, lastAt: null };
      sync.saveConfig(config);
      configRef.current = config;
      setSyncState({ config, status: 'idle', error: null });
      await syncNow();
    },
    [syncNow],
  );

  const disconnectSync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    sync.saveConfig(null);
    configRef.current = null;
    setSyncState({ config: null, status: 'off', error: null });
  }, []);

  const value: Store = {
    ready,
    words,
    byId,
    logs: snap?.logs ?? [],
    settings: snap?.settings ?? DEFAULT_SETTINGS,
    rate,
    undoLastRating,
    importRows,
    moveWord,
    removeWord,
    setSettings,
    exportBackup: () => snap!,
    restoreBackup,
    sync: syncState,
    connectSync,
    disconnectSync,
    syncNow,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
