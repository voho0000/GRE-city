import { useEffect, useMemo, useRef, useState } from 'react';
import { DISTRICT_BY_ID } from '../data/districts';
import { LEVEL_NAMES } from '../lib/levels';
import { answersByDay, summarizeDay, type DayChange } from '../lib/stats';
import { useStore } from '../lib/store';
import { addDays, dayKey } from '../lib/time';
import type { Word } from '../lib/types';

const WEEKS = 16;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const LIST_LIMIT = 40;

function shade(n: number): string {
  if (n === 0) return '#E6EBEF';
  if (n <= 20) return '#C7D3E0';
  if (n <= 50) return '#8FA6C1';
  if (n <= 100) return '#4F6F95';
  return '#1F3A5F';
}

function label(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  const wd = new Date(key + 'T00:00:00').getDay();
  return `${m} 月 ${d} 日（${WEEKDAYS[wd]}）`;
}

/** A calendar of study days and, for the chosen day, what was built, raised, torn down and forgotten. */
export function DailyLog() {
  const { logs, byId } = useStore();
  const today = dayKey(Date.now());
  const [selected, setSelected] = useState(today);
  const counts = useMemo(() => answersByDay(logs), [logs]);
  const summary = useMemo(() => summarizeDay(logs, selected), [logs, selected]);
  const heatRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the calendar scrolls sideways; start at the most recent weeks.
  useEffect(() => {
    const el = heatRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Columns are weeks (Sunday first), the last one ending today.
  const weeks = useMemo(() => {
    const now = Date.now();
    const start = addDays(now, -((WEEKS - 1) * 7 + new Date(now).getDay()));
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const t = addDays(start, w * 7 + d);
        const key = dayKey(t);
        return key > today ? null : { key, n: counts.get(key) ?? 0, month: new Date(t).getDate() <= 7 && d === 0 ? new Date(t).getMonth() + 1 : null };
      }),
    );
  }, [counts, today]);

  const total = summary.ratings.good + summary.ratings.hard + summary.ratings.again;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className="card stack">
      <div className="row-between wrap">
        <h2 className="h2 lg">每日紀錄</h2>
        <span className="small muted">點日期看那天做了什麼</span>
      </div>

      <div className="heat-wrap" ref={heatRef}>
        <div className="heat" role="group" aria-label={`近 ${WEEKS} 週每天的作答次數`}>
          <div className="heat-days" aria-hidden="true">
            <span />
            {WEEKDAYS.map((d, i) => <span key={d}>{i % 2 ? d : ''}</span>)}
          </div>
          {weeks.map((week, w) => (
            <div key={w} className="heat-col">
              <span className="heat-month tiny muted" aria-hidden="true">{week[0]?.month ? `${week[0].month}月` : ''}</span>
              {week.map((cell, d) =>
                cell ? (
                  <button
                    key={cell.key}
                    type="button"
                    className={`heat-cell${cell.key === selected ? ' on' : ''}`}
                    style={{ background: shade(cell.n) }}
                    aria-pressed={cell.key === selected}
                    aria-label={`${label(cell.key)}：${cell.n} 次作答`}
                    title={`${label(cell.key)}：${cell.n} 次作答`}
                    onClick={() => setSelected(cell.key)}
                  />
                ) : (
                  <span key={d} className="heat-cell empty" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="heat-legend tiny muted" aria-hidden="true">
          少 {[0, 10, 30, 80, 120].map((n) => <i key={n} style={{ background: shade(n) }} />)} 多
        </div>
      </div>

      <div className="day-head">
        <h3 className="h2">{selected === today ? `今天 · ${label(selected)}` : label(selected)}</h3>
        {summary.answers > 0 && <span className="small muted">作答 {summary.answers} 次 · 約 {summary.minutes} 分鐘</span>}
      </div>

      {summary.answers === 0 ? (
        <p className="muted small">這天沒有施工紀錄。</p>
      ) : (
        <>
          <div className="tiles5">
            <div className="tile"><span className="small muted">新建</span><span className="num">{summary.built.length}</span></div>
            <div className="tile"><span className="small muted">複習</span><span className="num">{summary.reviewed}</span></div>
            <div className="tile"><span className="small muted">升級</span><span className="num">{summary.raised.length}</span></div>
            <div className="tile warn"><span className="small">拆回</span><span className="num">{summary.torn.length}</span></div>
            <div className="tile gold"><span className="small">新地標</span><span className="num">{summary.landmarks.length}</span></div>
          </div>

          <div className="stack-6">
            <div className="split-bar" role="img" aria-label={`記得 ${pct(summary.ratings.good)}%，模糊 ${pct(summary.ratings.hard)}%，忘了 ${pct(summary.ratings.again)}%`}>
              <span style={{ flexGrow: summary.ratings.good, background: '#1F3A5F' }} />
              <span style={{ flexGrow: summary.ratings.hard, background: '#9FB3C8' }} />
              <span style={{ flexGrow: summary.ratings.again, background: '#D9822B' }} />
            </div>
            <div className="legend small muted">
              <span><i style={{ background: '#1F3A5F' }} />記得 {summary.ratings.good}（{pct(summary.ratings.good)}%）</span>
              <span><i style={{ background: '#9FB3C8' }} />模糊 {summary.ratings.hard}</span>
              <span><i style={{ background: '#D9822B' }} />忘了 {summary.ratings.again}</span>
            </div>
          </div>

          <WordGroup title="新蓋的建築" ids={summary.built} byId={byId} render={(w) => <span className="small muted">{DISTRICT_BY_ID[w.district].name}</span>} />
          <ChangeGroup title="升級" changes={summary.raised} byId={byId} />
          <ChangeGroup title="拆回地基" changes={summary.torn} byId={byId} warn />
          <WordGroup title="忘記的字" ids={summary.forgotten} byId={byId} warn render={(w) => <span className="small muted">{w.srs ? LEVEL_NAMES[w.srs.level] : ''}</span>} />
        </>
      )}
    </section>
  );
}

function WordGroup({ title, ids, byId, warn, render }: { title: string; ids: string[]; byId: Map<string, Word>; warn?: boolean; render: (w: Word) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const words = ids.map((id) => byId.get(id)).filter((w): w is Word => !!w);
  if (!words.length) return null;
  return (
    <div className="stack-6">
      <h4 className="h3">{title}<span className="muted small"> · {words.length}</span></h4>
      <div className="mini-chips">
        {(all ? words : words.slice(0, LIST_LIMIT)).map((w) => (
          <span key={w.id} className={`mini-chip${warn ? ' warn' : ''}`}>
            <b className="latin">{w.word}</b> <span className="small">{w.zh}</span> {render(w)}
          </span>
        ))}
      </div>
      {!all && words.length > LIST_LIMIT && <button type="button" className="btn-ghost" onClick={() => setAll(true)}>顯示全部 {words.length} 個</button>}
    </div>
  );
}

function ChangeGroup({ title, changes, byId, warn }: { title: string; changes: DayChange[]; byId: Map<string, Word>; warn?: boolean }) {
  const ids = changes.map((c) => c.wordId);
  const by = new Map(changes.map((c) => [c.wordId, c]));
  return (
    <WordGroup
      title={title}
      ids={ids}
      byId={byId}
      warn={warn}
      render={(w) => <span className="small muted">{LEVEL_NAMES[by.get(w.id)!.from]} → {LEVEL_NAMES[by.get(w.id)!.to]}</span>}
    />
  );
}
