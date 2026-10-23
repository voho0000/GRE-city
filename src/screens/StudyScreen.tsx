import { useEffect, useMemo, useState } from 'react';
import { Building } from '../components/Building';
import { DISTRICT_BY_ID } from '../data/districts';
import { buildingParts, iso, pts } from '../lib/city';
import { LEVEL_NAMES, daysLabel, rootSpan } from '../lib/levels';
import { applyRating, buildQueue, decayOf, type RatingResult } from '../lib/srs';
import { useStore } from '../lib/store';
import type { Rating, Word } from '../lib/types';

type Phase = 'front' | 'back' | 'done';
const REQUEUE_GAP = 5;
const EXTRA_BATCH = 10;

export function StudyScreen() {
  const { words, byId, settings, rate, syncNow } = useStore();
  const [queue, setQueue] = useState<string[]>(() => buildQueue(words, Date.now(), settings.dailyNew));
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('front');
  const [result, setResult] = useState<{ rating: Rating; r: RatingResult; requeued: boolean } | null>(null);
  const [session, setSession] = useState({ built: 0, raised: 0, again: 0 });
  const [busy, setBusy] = useState(false);

  const id = queue[pos];
  const word = id ? byId.get(id) : undefined;
  const finished = pos >= queue.length;

  // Finishing the day's queue is a natural point to upload.
  useEffect(() => {
    if (finished && queue.length) void syncNow();
  }, [finished, queue.length, syncNow]);

  const submit = async (rating: Rating) => {
    if (!word || busy) return;
    setBusy(true);
    const r = await rate(word.id, rating);
    let requeued = false;
    if (rating === 'again') {
      requeued = true;
      setQueue((q) => {
        const next = [...q];
        next.splice(Math.min(pos + 1 + REQUEUE_GAP, next.length), 0, word.id);
        return next;
      });
    }
    setSession((s) => ({
      built: s.built + (r.isNew && rating !== 'again' ? 1 : 0),
      raised: s.raised + (!r.isNew && r.levelAfter > r.levelBefore ? 1 : 0),
      again: s.again + (rating === 'again' ? 1 : 0),
    }));
    setResult({ rating, r, requeued });
    setPhase('done');
    setBusy(false);
  };

  const next = () => {
    setPos((p) => p + 1);
    setPhase('front');
    setResult(null);
  };

  const addExtra = () => {
    const inQueue = new Set(queue);
    const extra = words.filter((w) => !w.srs && !inQueue.has(w.id)).sort((a, b) => a.order - b.order).slice(0, EXTRA_BATCH).map((w) => w.id);
    setQueue((q) => [...q, ...extra]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (phase === 'front' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setPhase('back'); }
      else if (phase === 'back' && ['1', '2', '3'].includes(e.key)) submit((['again', 'hard', 'good'] as Rating[])[Number(e.key) - 1]);
      else if (phase === 'done' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress = queue.length ? Math.min(pos + (phase === 'done' ? 1 : 0), queue.length) : 0;

  return (
    <main className="study">
      <div className="row gap-12">
        <a className="icon-btn" href="#/city" aria-label="回到城市">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <div className="grow stack-6">
          <div className="row-between small muted"><span>今日工地</span><span>{progress} / {queue.length}</span></div>
          <div className="bar"><div style={{ width: `${queue.length ? (progress / queue.length) * 100 : 0}%`, background: '#1F3A5F' }} /></div>
        </div>
      </div>

      {finished ? (
        <Finished session={session} hasMore={words.some((w) => !w.srs)} onMore={addExtra} />
      ) : word ? (
        phase === 'front' ? (
          <Front word={word} onFlip={() => setPhase('back')} />
        ) : phase === 'back' ? (
          <Back word={word} words={words} busy={busy} onRate={submit} />
        ) : (
          result && <Done word={word} result={result} onNext={next} />
        )
      ) : null}
    </main>
  );
}

function DistrictChip({ word }: { word: Word }) {
  const d = DISTRICT_BY_ID[word.district];
  const label = word.srs ? LEVEL_NAMES[word.srs.level] : '新字';
  return (
    <span className="dchip"><span className="dot" style={{ background: d.color }} />{d.name}區 · {label}</span>
  );
}

function Front({ word, onFlip }: { word: Word; onFlip: () => void }) {
  const decay = decayOf(word.srs, Date.now());
  return (
    <div className="study-body">
      <div className="card flash center">
        <DistrictChip word={word} />
        <span className="latin word-xl">{word.word}</span>
        {word.pos && <span className="muted">{word.pos}</span>}
        {decay === 'weeds' && <span className="small warn-text">這棟已經長草了，答對就能修好</span>}
        <span className="muted small hint">先在心裡說出意思，再翻面<span className="kbd-hint">（空白鍵）</span></span>
      </div>
      <button type="button" className="btn-primary big" onClick={onFlip}>翻面</button>
    </div>
  );
}

function Highlighted({ word }: { word: Word }) {
  const span = rootSpan(word);
  if (!span) return <>{word.word}</>;
  return (
    <>
      {word.word.slice(0, span[0])}
      <mark className="root-mark">{word.word.slice(span[0], span[1])}</mark>
      {word.word.slice(span[1])}
    </>
  );
}

const RATE_LABEL: Record<Rating, string> = { again: '忘了', hard: '模糊', good: '記得' };

function rateHint(word: Word, rating: Rating): string {
  const r = applyRating(word.srs, rating, Date.now());
  if (r.isNew) return rating === 'good' ? '蓋小屋' : rating === 'hard' ? '先打地基' : '等等再看';
  if (rating === 'again') return '拆回地基';
  if (r.repaired) return '修復';
  if (rating === 'hard') return `維持${LEVEL_NAMES[r.levelAfter]}`;
  return r.levelAfter > r.levelBefore ? `蓋到${LEVEL_NAMES[r.levelAfter]}` : '地標巡禮';
}

function Back({ word, words, busy, onRate }: { word: Word; words: Word[]; busy: boolean; onRate: (r: Rating) => void }) {
  const d = DISTRICT_BY_ID[word.district];
  const neighbors = useMemo(
    () =>
      words
        .filter((w) => w.district === word.district && w.id !== word.id)
        .sort((a, b) => Number(!!b.srs) - Number(!!a.srs) || a.order - b.order)
        .slice(0, 4),
    [words, word],
  );
  return (
    <div className="study-body">
      <div className="card flash">
        <div className="stack-4">
          <span className="latin word-lg"><Highlighted word={word} /></span>
          {word.pos && <span className="muted small">{word.pos}</span>}
        </div>
        <span className="meaning">{word.zh}</span>
        <div className="panel stack-6">
          <span className="small muted w500">{d.name}區 · <span className="latin">{d.root}</span></span>
          <span className="small">{d.note}</span>
          {neighbors.length > 0 && (
            <span className="small muted">同街鄰居：<span className="latin">{neighbors.map((n) => n.word).join(' · ')}</span></span>
          )}
        </div>
        {word.example && (
          <div className="stack-4">
            <span className="small muted w500">例句</span>
            <span className="latin">{word.example}</span>
          </div>
        )}
      </div>
      <div className="rate-row">
        {(['again', 'hard', 'good'] as Rating[]).map((r, i) => (
          <button key={r} type="button" className={`rate rate-${r}`} disabled={busy} onClick={() => onRate(r)}>
            <span className="rate-label">{RATE_LABEL[r]}</span>
            <span className="small">{rateHint(word, r)}<span className="kbd-hint"> · {i + 1}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function doneCopy(word: Word, rating: Rating, r: RatingResult, requeued: boolean) {
  const d = DISTRICT_BY_ID[word.district];
  const next = requeued ? '等一下' : daysLabel(r.days);
  if (r.isNew) {
    if (rating === 'good') return { title: '蓋好小屋！', sub: `${word.word} 落腳${d.name}區`, next };
    if (rating === 'hard') return { title: '地基打好了', sub: '明天回來蓋第一層', next };
    return { title: '先放地基', sub: '這個字等一下會再出現', next };
  }
  if (rating === 'again') return { title: '拆回地基', sub: '別擔心，地點還在，等一下再見', next };
  if (r.repaired) return { title: '修好了！', sub: `${word.word} 恢復${LEVEL_NAMES[r.levelAfter]}的樣子`, next };
  if (rating === 'hard') return { title: '地基穩住了', sub: `維持${LEVEL_NAMES[r.levelAfter]}，下次早點回來`, next };
  if (r.levelAfter === r.levelBefore) return { title: '地標巡禮完成', sub: `${word.word} 依然閃亮`, next };
  return { title: '加蓋一層！', sub: `${word.word} 從${LEVEL_NAMES[r.levelBefore]}蓋到${LEVEL_NAMES[r.levelAfter]}`, next };
}

function Done({ word, result, onNext }: { word: Word; result: { rating: Rating; r: RatingResult; requeued: boolean }; onNext: () => void }) {
  const copy = doneCopy(word, result.rating, result.r, result.requeued);
  const d = DISTRICT_BY_ID[word.district];
  return (
    <div className="study-body">
      <div className="card flash center">
        <MiniScene level={result.r.levelAfter} accent={d.color} />
        <span className="title-lg">{copy.title}</span>
        <span className="muted">{copy.sub}</span>
        <div className="tiles2">
          <div className="tile left"><span className="small muted">下次來施工</span><b>{copy.next}</b></div>
          <div className="tile left"><span className="small muted">{d.name}區</span><b>{LEVEL_NAMES[result.r.levelAfter]}</b></div>
        </div>
      </div>
      <button type="button" className="btn-primary big" onClick={onNext} autoFocus>下一個字</button>
    </div>
  );
}

const SCALE = 1.45;
function MiniScene({ level, accent }: { level: number; accent: string }) {
  const W = 300;
  const H = 230;
  const ox = W / 2;
  const oy = 128;
  const P = (gx: number, gy: number): [number, number] => {
    const [x, y] = iso(gx, gy);
    return [ox + x * SCALE, oy + y * SCALE];
  };
  const ground = [P(-1.5, -1.5), P(1.5, -1.5), P(1.5, 1.5), P(-1.5, 1.5)];
  const E = 12;
  const neighbors: [number, number, number][] = [[-1, -1, 4], [0, -1, 1], [-1, 0, 2], [1, 0, 1], [0, 1, 0]];
  const at = (gx: number, gy: number, lv: number) => {
    const [cx, cy] = P(gx, gy);
    return buildingParts(cx, cy, lv, 'none', accent, SCALE);
  };
  const main = at(0, 0, level);
  const [L, B, R] = [ground[3], ground[2], ground[1]];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mini" aria-hidden="true">
      <polygon points={pts([L, B, [B[0], B[1] + E], [L[0], L[1] + E]])} fill="#B7C5AB" />
      <polygon points={pts([B, R, [R[0], R[1] + E], [B[0], B[1] + E]])} fill="#A2B296" />
      <polygon points={pts(ground)} fill="#F3E3D2" />
      {neighbors.filter(([x, y]) => x + y < 0).map(([x, y, lv]) => <Building key={`${x},${y}`} parts={at(x, y, lv)} />)}
      <g className="rise" key={level}>
        <Building parts={main} />
      </g>
      {neighbors.filter(([x, y]) => x + y > 0).map(([x, y, lv]) => <Building key={`${x},${y}`} parts={at(x, y, lv)} />)}
    </svg>
  );
}

function Finished({ session, hasMore, onMore }: { session: { built: number; raised: number; again: number }; hasMore: boolean; onMore: () => void }) {
  return (
    <div className="study-body">
      <div className="card flash center">
        <span className="title-lg">今天的工地完工了</span>
        <div className="tiles3 wide">
          <div className="tile"><span className="small muted">新建</span><span className="num">{session.built}</span></div>
          <div className="tile"><span className="small muted">加蓋</span><span className="num">{session.raised}</span></div>
          <div className="tile"><span className="small muted">拆回地基</span><span className="num">{session.again}</span></div>
        </div>
        <span className="muted small">明天會有新的到期建築等你回來。</span>
      </div>
      <a className="btn-primary big" href="#/city">回城市看看</a>
      {hasMore && <button type="button" className="btn-ghost big" onClick={onMore}>再多蓋 {EXTRA_BATCH} 棟</button>}
    </div>
  );
}
