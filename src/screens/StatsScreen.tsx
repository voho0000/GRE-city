import { useMemo, useState } from 'react';
import { DISTRICTS } from '../data/districts';
import { DailyLog } from '../components/DailyLog';
import { LEVEL_NAMES } from '../lib/levels';
import { decayOf } from '../lib/srs';
import { useStore } from '../lib/store';
import { addDays, dayKey, streakDays } from '../lib/time';
import { DAILY_MAX, DAILY_MIN } from '../lib/types';

export function StatsScreen() {
  const { words, logs, settings, setSettings } = useStore();
  const [daily, setDaily] = useState(String(settings.dailyNew));
  const now = useMemo(() => Date.now(), [words, logs]);

  const s = useMemo(() => {
    const learned = words.filter((w) => w.srs);
    const levels = LEVEL_NAMES.map((_, i) => learned.filter((w) => w.srs!.level === i).length);
    const decayed = learned.filter((w) => decayOf(w.srs, now) !== 'none').length;
    const days = new Set(logs.map((l) => dayKey(l.at)));
    const recent = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(now, i - 13);
      const key = dayKey(day);
      const dayLogs = logs.filter((l) => dayKey(l.at) === key);
      return { key, label: `${new Date(day).getMonth() + 1}/${new Date(day).getDate()}`, built: dayLogs.filter((l) => l.isNew).length, reviews: dayLogs.filter((l) => !l.isNew).length };
    });
    const perDistrict = DISTRICTS.map((d) => {
      const list = learned.filter((w) => w.district === d.id);
      const avg = list.length ? list.reduce((a, w) => a + w.srs!.level, 0) / list.length : 0;
      const lapses = list.reduce((a, w) => a + w.srs!.lapses, 0);
      return { d, count: list.length, avg, lapses };
    });
    const hardest = [...learned].filter((w) => w.srs!.lapses > 0).sort((a, b) => b.srs!.lapses - a.srs!.lapses).slice(0, 10);
    return { learned: learned.length, levels, decayed, streak: streakDays(days, now), recent, perDistrict, hardest };
  }, [words, logs, now]);

  const maxLevel = Math.max(1, ...s.levels);
  const maxDay = Math.max(1, ...s.recent.map((r) => r.built + r.reviews));
  const save = () => {
    const n = Math.round(Number(daily));
    if (n >= DAILY_MIN && n <= DAILY_MAX) setSettings({ dailyNew: n, onboarded: true });
  };

  return (
    <main className="page">
      <DailyLog />
      <div className="tiles4">
        <div className="card tile-lg"><span className="small muted">建築總數</span><span className="num lg">{s.learned}</span></div>
        <div className="card tile-lg"><span className="small muted">地標</span><span className="num lg">{s.levels[5]}</span></div>
        <div className="card tile-lg"><span className="small muted">待修復</span><span className="num lg">{s.decayed}</span></div>
        <div className="card tile-lg"><span className="small muted">連續施工</span><span className="num lg">{s.streak} 天</span></div>
      </div>

      <div className="grid2">
        <section className="card stack">
          <h2 className="h2">建築分布</h2>
          {LEVEL_NAMES.map((name, i) => (
            <div key={name} className="hbar">
              <span className="small">{name}</span>
              <span className="bar"><span style={{ width: `${(s.levels[i] / maxLevel) * 100}%`, background: i === 5 ? '#E8B23A' : '#1F3A5F' }} /></span>
              <span className="small num-sm">{s.levels[i]}</span>
            </div>
          ))}
        </section>
        <section className="card stack">
          <h2 className="h2">近 14 天</h2>
          <div className="cols" role="img" aria-label="近 14 天每日新建與複習數量">
            {s.recent.map((r) => (
              <div key={r.key} className="col" title={`${r.label}：新建 ${r.built}、複習 ${r.reviews}`}>
                <div className="col-stack">
                  <span style={{ height: `${(r.reviews / maxDay) * 100}%`, background: '#9FB3C8' }} />
                  <span style={{ height: `${(r.built / maxDay) * 100}%`, background: '#D9822B' }} />
                </div>
                <span className="tiny muted">{r.label}</span>
              </div>
            ))}
          </div>
          <div className="legend small muted">
            <span><i style={{ background: '#D9822B' }} />新建</span>
            <span><i style={{ background: '#9FB3C8' }} />複習</span>
          </div>
        </section>
      </div>

      <div className="grid2">
        <section className="card stack">
          <h2 className="h2">各街區</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>街區</th><th>棟數</th><th>平均等級</th><th>忘記次數</th></tr></thead>
              <tbody>
                {s.perDistrict.map(({ d, count, avg, lapses }) => (
                  <tr key={d.id}>
                    <td><span className="swatch inline" style={{ background: d.color }} />{d.name}</td>
                    <td>{count}</td>
                    <td>{count ? avg.toFixed(1) : '—'}</td>
                    <td>{lapses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card stack">
          <h2 className="h2">最常拆的字</h2>
          {s.hardest.length === 0 ? (
            <p className="muted small">還沒有忘記過的字。</p>
          ) : (
            <ol className="hard-list">
              {s.hardest.map((w) => (
                <li key={w.id}><b className="latin">{w.word}</b> <span className="muted small">{w.zh}</span><span className="small warn-text">忘 {w.srs!.lapses} 次</span></li>
              ))}
            </ol>
          )}
          <h2 className="h2 mt">設定</h2>
          <div className="row wrap gap-12 end">
            <label className="field">
              <span className="small muted">每天新字數</span>
              <input type="number" min={DAILY_MIN} max={DAILY_MAX} value={daily} onChange={(e) => setDaily(e.target.value)} />
            </label>
            <button type="button" className="btn-primary" onClick={save}>儲存</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.pauseNewOnBacklog} onChange={(e) => setSettings({ pauseNewOnBacklog: e.target.checked })} />
            <span className="small">複習積太多時暫停新字（先把舊的蓋回來）</span>
          </label>
        </section>
      </div>
    </main>
  );
}
