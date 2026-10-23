import { useMemo, useState } from 'react';
import { CityMap } from '../components/CityMap';
import { DailyGoal } from '../components/DailyGoal';
import { StudyOrderPicker } from '../components/StudyOrderPicker';
import { DISTRICTS, DISTRICT_BY_ID } from '../data/districts';
import { layoutCity } from '../lib/city';
import { LEVEL_NAMES, daysLabel } from '../lib/levels';
import { decayOf } from '../lib/srs';
import { useStore } from '../lib/store';
import { daysBetween } from '../lib/time';
import type { DistrictId } from '../lib/types';

const CHIP_LIMIT = 120;

export function CityScreen({ queueSize, newToday, reviewsDone }: { queueSize: number; newToday: number; reviewsDone: number }) {
  const { words, byId, logs, settings, setSettings } = useStore();
  const [editingGoal, setEditingGoal] = useState(false);
  // Decay is judged as of the last data change; the screen re-renders on every rating anyway.
  const now = useMemo(() => Date.now(), [words]);
  const layout = useMemo(() => layoutCity(words, now), [words, now]);
  const [district, setDistrict] = useState<DistrictId>('speech');
  const [focused, setFocused] = useState(false);
  const [wordId, setWordId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    const per = new Map(DISTRICTS.map((d) => [d.id, { built: 0, total: 0 }]));
    let decayed = 0;
    for (const w of words) {
      const s = per.get(w.district)!;
      s.total++;
      if (w.srs) s.built++;
      if (decayOf(w.srs, now) !== 'none') decayed++;
    }
    return { per, decayed };
  }, [words, now]);

  const block = layout.blocks.find((b) => b.district.id === district)!;
  const d = DISTRICT_BY_ID[district];
  const districtWords = useMemo(
    () => words.filter((w) => w.district === district && w.srs).sort((a, b) => b.srs!.level - a.srs!.level || a.word.localeCompare(b.word)),
    [words, district],
  );
  const selected = wordId ? byId.get(wordId) : undefined;
  const pickDistrict = (id: DistrictId) => {
    setDistrict(id);
    setFocused(true);
    setShowAll(false);
  };
  const pickWord = (id: string) => {
    setWordId(id);
    const w = byId.get(id);
    if (w) setDistrict(w.district);
  };
  const firstVisit = !settings.onboarded && logs.length === 0;
  const remaining = words.filter((w) => !w.srs).length;
  const done = newToday + reviewsDone;
  const total = done + queueSize;

  return (
    <main className="city">
      <aside className="city-side">
        {firstVisit ? (
          <section className="card stack welcome">
            <h2 className="h2 lg">歡迎來到字城</h2>
            <p className="small">每背會一個新字，就在島上蓋一棟建築；複習答對，建築就升級。先決定每天想蓋幾棟新建築吧，之後隨時可以在這裡調整。</p>
            <DailyGoal initial={settings.dailyNew} remaining={remaining} confirmLabel="開始建城" onConfirm={(n) => setSettings({ dailyNew: n, onboarded: true })} />
          </section>
        ) : editingGoal ? (
          <section className="card stack">
            <h2 className="h2">每天新建幾棟？</h2>
            <DailyGoal
              initial={settings.dailyNew}
              remaining={remaining}
              confirmLabel="儲存"
              onConfirm={(n) => { setSettings({ dailyNew: n, onboarded: true }); setEditingGoal(false); }}
              onCancel={() => setEditingGoal(false)}
            />
          </section>
        ) : (
        <section className="card stack">
          <div className="row-between">
            <h2 className="h2">今日工地</h2>
            {!editingGoal && <button type="button" className="btn-text" onClick={() => setEditingGoal(true)}>每天 {settings.dailyNew} 棟 · 調整</button>}
          </div>
          <div className="tiles3">
            <div className="tile"><span className="muted small">新地基</span><span className="num">{newToday}<span className="small muted"> / {settings.dailyNew}</span></span></div>
            <div className="tile"><span className="muted small">待施工</span><span className="num">{queueSize}</span></div>
            <div className="tile warn"><span className="small">待修復</span><span className="num">{stats.decayed}</span></div>
          </div>
          <div className="stack-6">
            <div className="row-between small muted"><span>今日進度</span><span>{done} / {total}</span></div>
            <div className="bar"><div style={{ width: `${total ? (done / total) * 100 : 0}%`, background: '#1F3A5F' }} /></div>
          </div>
          <StudyOrderPicker />
          <a className="btn-primary" href="#/study">{queueSize ? `開始施工 · ${queueSize}` : '今天的工地完工了'}</a>
        </section>
        )}
        <section className="card list">
          <h2 className="h2 pad">街區</h2>
          {DISTRICTS.map((x) => {
            const s = stats.per.get(x.id)!;
            return (
              <button key={x.id} type="button" className={`district-row${x.id === district ? ' on' : ''}`} onClick={() => pickDistrict(x.id)}>
                <span className="swatch" style={{ background: x.color }} />
                <span className="grow stack-4">
                  <span className="row-between">
                    <span><b className="w500">{x.name}</b> <span className="latin small muted">{x.root}</span></span>
                    <span className="small muted">{s.built} / {s.total}</span>
                  </span>
                  <span className="bar thin"><span style={{ width: `${s.total ? (s.built / s.total) * 100 : 0}%`, background: x.color }} /></span>
                </span>
              </button>
            );
          })}
        </section>
      </aside>

      <section className="city-main">
        <div className="card stack">
          <div className="row-between wrap">
            <div className="row gap-10 baseline">
              <h2 className="h2 lg">{focused ? `${d.name}街區` : '全島遠景'}</h2>
              <span className="small muted">拖曳平移、滾輪或雙指縮放 · 每一棟＝一個單字</span>
            </div>
          </div>
          <CityMap
            layout={layout}
            selectedDistrict={district}
            selectedWord={wordId}
            focus={focused ? block.bounds : null}
            onSelectDistrict={pickDistrict}
            onSelectWord={pickWord}
          />
          <div className="legend small muted">
            <span><i style={{ border: '1px dashed #5A6672', background: '#fff' }} />地基＝剛學</span>
            <span><i style={{ background: '#7C9CC0' }} />小屋→塔樓＝複習中</span>
            <span><i style={{ background: '#E8B23A' }} />金頂地標＝熟練</span>
            <span><i style={{ background: '#C9C5BA' }} />褪色長草＝逾期待修</span>
          </div>
        </div>

        {selected && selected.srs && (
          <div className="card row wrap gap-16 word-detail">
            <div className="stack-4 grow">
              <span className="latin xl">{selected.word}</span>
              <span>{selected.zh} <span className="muted small">{selected.pos}</span></span>
            </div>
            <div className="stack-4 small">
              <span>{LEVEL_NAMES[selected.srs.level]}（{selected.srs.level} 級）· {DISTRICT_BY_ID[selected.district].name}區</span>
              <span className="muted">
                {decayOf(selected.srs, now) === 'none' ? `下次施工：${daysLabel(daysBetween(now, selected.srs.due))}` : `逾期 ${daysBetween(selected.srs.due, now)} 天，待修復`} · 忘記 {selected.srs.lapses} 次
              </span>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setWordId(null)}>關閉</button>
          </div>
        )}

        <div className="card stack">
          <div className="row wrap gap-10 baseline">
            <span className="swatch" style={{ background: d.color }} />
            <h2 className="h2 lg">{d.name}區</h2>
            <span className="latin muted">{d.root}</span>
            <span className="small muted">· {d.note} · {districtWords.length} 棟</span>
            <span className="grow" />
            {settings.studyOrder === 'district' && settings.focusDistrict === district ? (
              <span className="small muted">新字正從這區開始</span>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => setSettings({ studyOrder: 'district', focusDistrict: district })}>從這區開始背</button>
            )}
          </div>
          {districtWords.length === 0 ? (
            <p className="muted">這區還是空地。開始今日施工，第一棟就會出現在這裡。</p>
          ) : (
            <div className="chips">
              {(showAll ? districtWords : districtWords.slice(0, CHIP_LIMIT)).map((w) => {
                const decay = decayOf(w.srs, now);
                return (
                  <button key={w.id} type="button" className={`chip${decay !== 'none' ? ' warn' : ''}${w.id === wordId ? ' on' : ''}`} onClick={() => setWordId(w.id)}>
                    <span className="row-between"><b className="latin">{w.word}</b><span className="small">{LEVEL_NAMES[w.srs!.level]}</span></span>
                    <span className="row-between small muted"><span className="ellipsis">{w.zh}</span><span>{decay !== 'none' ? `逾期 ${daysBetween(w.srs!.due, now)} 天` : daysLabel(daysBetween(now, w.srs!.due))}</span></span>
                  </button>
                );
              })}
            </div>
          )}
          {!showAll && districtWords.length > CHIP_LIMIT && (
            <button type="button" className="btn-ghost" onClick={() => setShowAll(true)}>顯示全部 {districtWords.length} 棟</button>
          )}
        </div>
      </section>
    </main>
  );
}
