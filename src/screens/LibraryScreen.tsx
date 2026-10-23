import { useMemo, useRef, useState } from 'react';
import { DISTRICTS, DISTRICT_BY_ID } from '../data/districts';
import { parseWordList, type ParsedRow } from '../lib/csv';
import type { Snapshot } from '../lib/db';
import { LEVEL_NAMES } from '../lib/levels';
import { SyncPanel } from '../components/SyncPanel';
import { useStore } from '../lib/store';
import { dayKey } from '../lib/time';
import type { DistrictId } from '../lib/types';

const PAGE = 100;

export function LibraryScreen() {
  const { words, moveWord, removeWord } = useStore();
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState<DistrictId | 'all'>('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return words
      .filter((w) => (district === 'all' || w.district === district) && (!needle || w.id.includes(needle) || w.zh.includes(needle)))
      .sort((a, b) => a.word.localeCompare(b.word));
  }, [words, q, district]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <main className="page">
      <div className="grid3">
        <ImportPanel />
        <SyncPanel />
        <BackupPanel />
      </div>
      <section className="card stack">
        <div className="row wrap gap-12 baseline">
          <h2 className="h2 lg">字庫</h2>
          <span className="small muted">共 {words.length} 字，已蓋 {words.filter((w) => w.srs).length} 棟。用「街區」選單把字搬到別區。</span>
        </div>
        <div className="row wrap gap-12">
          <label className="field grow">
            <span className="small muted">搜尋</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="英文或中文" />
          </label>
          <label className="field">
            <span className="small muted">街區</span>
            <select value={district} onChange={(e) => { setDistrict(e.target.value as DistrictId | 'all'); setPage(0); }}>
              <option value="all">全部</option>
              {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>單字</th><th>中文</th><th>街區</th><th>建築</th><th><span className="sr-only">操作</span></th></tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.id}>
                  <td className="latin w500">{w.word} <span className="muted small">{w.pos}</span>{w.kk && <div className="kk small">[{w.kk}]</div>}</td>
                  <td>{w.zh}</td>
                  <td>
                    <select aria-label={`${w.word} 的街區`} value={w.district} onChange={(e) => moveWord(w.id, e.target.value as DistrictId)}>
                      {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="small">{w.srs ? LEVEL_NAMES[w.srs.level] : <span className="muted">未開工</span>}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => { if (confirm(`刪除 ${w.word}？它的建築也會消失。`)) removeWord(w.id); }}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="row gap-12 center-row">
            <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>上一頁</button>
            <span className="small muted">{page + 1} / {pages}</span>
            <button type="button" className="btn-ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>下一頁</button>
          </div>
        )}
      </section>
    </main>
  );
}

function ImportPanel() {
  const { importRows, byId } = useStore();
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const rows: ParsedRow[] = useMemo(() => parseWordList(text), [text]);
  const fresh = rows.filter((r) => !byId.has(r.word.toLowerCase())).length;
  const counts = useMemo(() => {
    const c = new Map<DistrictId, number>();
    for (const r of rows) c.set(r.district, (c.get(r.district) ?? 0) + 1);
    return [...c.entries()];
  }, [rows]);

  const onFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };
  const doImport = async () => {
    const { added, skipped } = await importRows(rows);
    setMessage(`匯入 ${added} 字${skipped ? `，略過 ${skipped} 個重複` : ''}。新字會排進每日工地。`);
    setText('');
  };

  return (
    <section className="card stack">
      <h2 className="h2">匯入字表</h2>
      <p className="small muted">貼上 CSV 或從 Excel 複製（Tab 分隔），第一列寫欄位名稱：<span className="latin">word, zh, pos, kk, example, example_zh, district</span>，順序不限，只有 word 和 zh 必填；沒填街區會依字根和中文自動分區。</p>
      <label className="field">
        <span className="small muted">字表內容</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'word,zh,pos,kk\nloquacious,多話的,adj.,loˋkweʃəs'} />
      </label>
      <div className="row wrap gap-12">
        <label className="btn-ghost file-btn">
          選擇檔案
          <input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="btn-primary" disabled={!fresh} onClick={doImport}>匯入 {fresh} 個新字</button>
      </div>
      {rows.length > 0 && (
        <p className="small muted">
          讀到 {rows.length} 字：{counts.map(([d, n]) => `${DISTRICT_BY_ID[d].name} ${n}`).join('、')}
        </p>
      )}
      {message && <p className="small ok-text" role="status">{message}</p>}
    </section>
  );
}

function BackupPanel() {
  const { exportBackup, restoreBackup } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const download = () => {
    const blob = new Blob([JSON.stringify({ app: 'gre-city', version: 1, ...exportBackup() })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gre-city-${dayKey(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Snapshot & { app?: string };
      if (data.app !== 'gre-city' || !Array.isArray(data.words) || !Array.isArray(data.logs)) throw new Error('bad file');
      if (!confirm(`用備份取代目前的城市？備份裡有 ${data.words.length} 字。`)) return;
      await restoreBackup({ words: data.words, logs: data.logs, settings: data.settings, deleted: data.deleted ?? {} });
      setMessage('已還原備份。');
    } catch {
      setMessage('這不是字城的備份檔。');
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  return (
    <section className="card stack">
      <h2 className="h2">備份</h2>
      <p className="small muted">下載一份 JSON 檔留存。還原會用備份取代這台裝置目前的資料。</p>
      <div className="row wrap gap-12">
        <button type="button" className="btn-primary" onClick={download}>下載備份</button>
        <label className="btn-ghost file-btn">
          從備份還原
          <input ref={input} type="file" accept=".json,application/json" onChange={(e) => restore(e.target.files?.[0])} />
        </label>
      </div>
      {message && <p className="small" role="status">{message}</p>}
    </section>
  );
}
