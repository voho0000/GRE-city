import { useEffect, useMemo, useState } from 'react';
import { Building } from '../components/Building';
import { SilentModeTip } from '../components/SilentModeTip';
import { DISTRICT_BY_ID } from '../data/districts';
import { buildingParts, iso, pts } from '../lib/city';
import { LEVEL_NAMES, daysLabel } from '../lib/levels';
import { applyRating, buildQueue, decayOf, orderNewWords, type RatingResult } from '../lib/srs';
import { dayStates, gateNew, learningIds, repeatGap, restingToday, step, weaveIn } from '../lib/learning';
import { canPronounce, speak } from '../lib/speech';
import { useStore } from '../lib/store';
import { findInSentence } from '../lib/example';
import { rootsFor } from '../lib/roots';
import { buildSynonymIndex } from '../lib/synonyms';
import { thesaurusFor, type Related } from '../lib/thesaurus';
import type { Rating, Word } from '../lib/types';

type Phase = 'front' | 'back' | 'done';
const EXTRA_BATCH = 10;

export function StudyScreen() {
  const { words, byId, logs, settings, setSettings, rate, undoLastRating, syncNow } = useStore();
  const [queue, setQueue] = useState<string[]>(() => {
    // Words still being relearned from earlier today come back first, a few cards apart.
    const learning = learningIds(dayStates(logs, Date.now()));
    const q = weaveIn(buildQueue(words, Date.now(), settings.dailyNew, settings), learning);
    return gateNew(q, 0, new Set(learning), (id) => !byId.get(id)?.srs);
  });
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<Phase>('front');
  const [result, setResult] = useState<{ rating: Rating; r: RatingResult; requeued: boolean; resting: boolean } | null>(null);
  const [session, setSession] = useState({ built: 0, raised: 0, again: 0 });
  const [busy, setBusy] = useState(false);
  // Screen state before each rating, so a mis-tap can be taken back.
  const [history, setHistory] = useState<{ pos: number; queue: string[]; session: typeof session }[]>([]);
  const synonyms = useMemo(() => buildSynonymIndex(words), [words]);
  const today = useMemo(() => dayStates(logs, Date.now()), [logs]);

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
    setHistory((h) => [...h.slice(-19), { pos, queue, session }]);
    const r = await rate(word.id, rating);
    const state = step(today.get(word.id), rating, r.isNew);
    const gap = repeatGap(state);
    const requeued = gap !== null;
    if (gap !== null) {
      setQueue((q) => {
        const next = [...q];
        next.splice(Math.min(pos + 1 + gap, next.length), 0, word.id);
        return next;
      });
    }
    setSession((s) => ({
      built: s.built + (r.isNew && rating !== 'again' ? 1 : 0),
      raised: s.raised + (!r.isNew && r.levelAfter > r.levelBefore ? 1 : 0),
      again: s.again + (rating === 'again' ? 1 : 0),
    }));
    setResult({ rating, r, requeued, resting: restingToday(state) });
    setPhase('done');
    setBusy(false);
  };

  const next = () => {
    setQueue((q) => gateNew(q, pos + 1, new Set(learningIds(today)), (id) => !byId.get(id)?.srs));
    setPos((p) => p + 1);
    setPhase('front');
    setResult(null);
  };

  /** Takes back the last rating and shows that card's answer again, ready to be rated anew. */
  const undo = async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    if (await undoLastRating()) {
      setHistory((h) => h.slice(0, -1));
      setQueue(last.queue);
      setSession(last.session);
      setPos(last.pos);
      setResult(null);
      setPhase('back');
    }
    setBusy(false);
  };
  const flip = () => setPhase('back');

  const addExtra = () => {
    const inQueue = new Set(queue);
    const extra = orderNewWords(words, Date.now(), settings).filter((w) => !inQueue.has(w.id)).slice(0, EXTRA_BATCH).map((w) => w.id);
    setQueue((q) => [...q, ...extra]);
  };

  // Read each new card aloud as it appears, if the learner wants that.
  const autoSpeak = settings.autoSpeak && canPronounce();
  useEffect(() => {
    if (autoSpeak && phase === 'front' && word) speak(word.word, settings.voiceSource);
  }, [autoSpeak, phase, pos, word?.word]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (word && (e.key === 'p' || e.key === 'P')) speak(word.word, settings.voiceSource);
      else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && history.length && phase !== 'back') { e.preventDefault(); void undo(); }
      else if (phase === 'front' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
      else if (phase === 'back' && ['1', '2', '3'].includes(e.key)) submit((['again', 'hard', 'good'] as Rating[])[Number(e.key) - 1]);
      else if (phase === 'done' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Count the whole day, not just this visit: words already answered today stay done after leaving and coming back.
  // The whole day, not just this visit: every word answered today, grouped by its latest answer, plus what is left.
  const tally = useMemo(() => {
    const counts: Record<Rating, number> = { again: 0, hard: 0, good: 0 };
    for (const st of today.values()) counts[st.last]++;
    const answered = today.size;
    const left = new Set(queue.slice(pos + (phase === 'done' ? 1 : 0)).filter((id) => !today.has(id))).size;
    return { counts, answered, left, total: answered + left };
  }, [today, queue, pos, phase]);
  const pct = (n: number) => `${tally.total ? (n / tally.total) * 100 : 0}%`;

  return (
    <main className="study">
      <div className="row gap-12">
        <a className="icon-btn" href="#/city" aria-label="回到城市" title="回到城市">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <div className="grow stack-6">
          <span className="small muted nowrap">今日工地</span>
          <div className="bar stacked" role="img" aria-label={`會了 ${tally.counts.good}，看了才想起 ${tally.counts.hard}，不會 ${tally.counts.again}，還剩 ${tally.left}`}>
            {(['good', 'hard', 'again'] as Rating[]).map((r) => <span key={r} className={`seg seg-${r}`} style={{ width: pct(tally.counts[r]) }} />)}
          </div>
        </div>
        {history.length > 0 && phase !== 'back' && !finished && (
          <button type="button" className="toggle small undo-btn" aria-label="收回上一張的評分" title="收回上一張的評分（Z）" disabled={busy} onClick={() => void undo()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
            收回
          </button>
        )}
        {canPronounce() && (
          <button type="button" className={`toggle small${settings.autoSpeak ? ' on' : ''}`} aria-pressed={settings.autoSpeak} onClick={() => setSettings({ autoSpeak: !settings.autoSpeak })}>
            自動發音
          </button>
        )}
      </div>
      <div className="tally small">
        <span><i className="seg-good" />會了 <b>{tally.counts.good}</b></span>
        <span><i className="seg-hard" />看了才想起 <b>{tally.counts.hard}</b></span>
        <span><i className="seg-again" />不會 <b>{tally.counts.again}</b></span>
        <span className="tally-left">已答 <b>{tally.answered}</b> / {tally.total}</span>
      </div>

      {canPronounce() && <SilentModeTip />}

      {finished ? (
        <Finished session={session} hasMore={words.some((w) => !w.srs)} onMore={addExtra} />
      ) : word ? (
        phase === 'front' ? (
          <Front word={word} onFlip={flip} />
        ) : phase === 'back' ? (
          <Back word={word} words={words} synonyms={synonyms.get(word.id) ?? []} byId={byId} busy={busy} onRate={submit} />
        ) : (
          result && <Done word={word} result={result} onNext={next} onUndo={undo} />
        )
      ) : null}
    </main>
  );
}

/** Front of the card: new or review, and the building at stake, but nothing that hints at the meaning. */
function StatusChip({ word }: { word: Word }) {
  return <span className="dchip">{word.srs ? `複習 · ${LEVEL_NAMES[word.srs.level]}` : '新字'}</span>;
}

function DistrictChip({ word }: { word: Word }) {
  const d = DISTRICT_BY_ID[word.district];
  return (
    <span className="dchip"><span className="dot" style={{ background: d.color }} />{d.name}區</span>
  );
}

function Pronunciation({ word, align = 'center' }: { word: Word; align?: 'center' | 'start' }) {
  if (!word.kk && !canPronounce()) return null;
  return (
    <span className={`pron ${align}`}>
      {word.kk && <span className="kk">[{word.kk}]</span>}
      {canPronounce() && <SpeakButton word={word} />}
    </span>
  );
}

function SpeakButton({ word }: { word: Word }) {
  const { settings } = useStore();
  return (
    <button type="button" className="icon-btn speak" aria-label={`唸出 ${word.word}`} title="發音（P）" onClick={() => speak(word.word, settings.voiceSource)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}

function Front({ word, onFlip }: { word: Word; onFlip: () => void }) {
  const decay = decayOf(word.srs, Date.now());
  return (
    <div className="study-body">
      <div className="card flash center" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onFlip(); }}>
        <StatusChip word={word} />
        <span className="latin word-xl">{word.word}</span>
        <Pronunciation word={word} />
        {word.pos && <span className="muted">{word.pos}</span>}
        {decay === 'weeds' && <span className="small warn-text">這棟已經長草了，答對就能修好</span>}
        <span className="muted small hint">先在心裡說出意思，再點卡片翻面<span className="kbd-hint">（空白鍵翻面，P 發音）</span></span>
      </div>
      <button type="button" className="btn-primary big" onClick={onFlip}>翻面</button>
    </div>
  );
}

function ExampleSentence({ sentence, word }: { sentence: string; word: string }) {
  const at = findInSentence(sentence, word);
  if (!at) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at[0])}
      <b className="ex-word">{sentence.slice(at[0], at[1])}</b>
      {sentence.slice(at[1])}
    </>
  );
}

/** The word's own root breakdown (or origin story), so the meaning can be rebuilt from its parts. */
function RootBlock({ id }: { id: string }) {
  const info = rootsFor(id);
  if (!info) return null;
  if (!info.parts.length)
    return (
      <div className="roots">
        <span className="small"><span className="w500">字源</span>　<span className="muted">{info.note}</span></span>
      </div>
    );
  return (
    <div className="roots">
      <div className="root-parts">
        <span className="small w500">字根</span>
        {info.parts.map((p, i) => (
          <span key={i} className="root-part">
            {i > 0 && <span className="muted" aria-hidden="true">+</span>}
            <span className="root-chip"><b className="latin">{p.morph}</b>{p.meaning && <span className="small">{p.meaning}</span>}</span>
          </span>
        ))}
      </div>
      {info.note && <span className="small muted">{info.note}</span>}
    </div>
  );
}

function RelatedRow({ label, kind, items }: { label: string; kind: 'syn' | 'ant'; items: Related[] }) {
  return (
    <div className="thes-row">
      <span className={`thes-tag ${kind}`} aria-label={kind === 'syn' ? '同義字' : '反義字'}>{label}</span>
      <span className="latin">
        {items.map((r, i) => (
          <span key={r.text}>
            {i > 0 && <span className="muted"> · </span>}
            {r.known ? <b className="thes-known" title="也在你的字庫裡">{r.text}</b> : r.text}
          </span>
        ))}
      </span>
    </div>
  );
}

const RATE_LABEL: Record<Rating, string> = { again: '不會', hard: '看了才想起', good: '想出來了' };

function rateHint(word: Word, rating: Rating): string {
  const r = applyRating(word.srs, rating, Date.now());
  if (r.isNew) return rating === 'good' ? '蓋小屋' : rating === 'hard' ? '先打地基' : '等等再看';
  if (rating === 'again') return r.levelBefore === 0 ? '等等再看' : '拆回地基';
  if (r.repaired) return '修復';
  if (rating === 'hard') return `維持${LEVEL_NAMES[r.levelAfter]}`;
  return r.levelAfter > r.levelBefore ? `蓋到${LEVEL_NAMES[r.levelAfter]}` : '地標巡禮';
}

function Back({ word, words, synonyms, byId, busy, onRate }: { word: Word; words: Word[]; synonyms: string[]; byId: Map<string, Word>; busy: boolean; onRate: (r: Rating) => void }) {
  const thes = useMemo(() => {
    const sameSense = synonyms.map((id) => byId.get(id)).filter((w): w is Word => !!w);
    return thesaurusFor(word, sameSense, new Set(byId.keys()));
  }, [word, synonyms, byId]);
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
      <div className="card flash back">
        <div className="back-head">
          <div className="stack-2 grow">
            <span className="latin word-lg">{word.word}</span>
            <span className="back-sub">
              {word.kk && <span className="kk">[{word.kk}]</span>}
              {word.pos && <span className="muted small">{word.pos}</span>}
            </span>
          </div>
          {canPronounce() && <SpeakButton word={word} />}
        </div>
        <span className="meaning">{word.zh}</span>
        <RootBlock id={word.id} />
        {word.example && (
          <div className="example">
            <span className="latin"><ExampleSentence sentence={word.example} word={word.word} /></span>
            {word.exampleZh && <span className="small muted">{word.exampleZh}</span>}
          </div>
        )}
        {(thes.synonyms.length > 0 || thes.antonyms.length > 0) && (
          <div className="thes">
            {thes.synonyms.length > 0 && <RelatedRow label="同" kind="syn" items={thes.synonyms} />}
            {thes.antonyms.length > 0 && <RelatedRow label="反" kind="ant" items={thes.antonyms} />}
          </div>
        )}
        <div className="district-line small muted">
          <DistrictChip word={word} />
          <span>{d.note}{neighbors.length > 0 && <>，同街：<span className="latin">{neighbors.map((n) => n.word).join(' · ')}</span></>}</span>
        </div>
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

function doneCopy(word: Word, rating: Rating, r: RatingResult, requeued: boolean, resting: boolean) {
  const d = DISTRICT_BY_ID[word.district];
  const next = requeued ? '等一下' : daysLabel(r.days);
  if (resting) return { title: '今天先休息', sub: `${word.word} 今天卡了 4 次，再硬背效果有限，明天換個腦袋再來`, next };
  if (r.isNew) {
    if (rating === 'good') return { title: '蓋好小屋！', sub: `${word.word} 落腳${d.name}區`, next };
    if (rating === 'hard') return { title: '地基打好了', sub: requeued ? '等一下再考一次，確定記住' : '明天回來蓋第一層', next };
    return { title: '先放地基', sub: '這個字等一下會再出現', next };
  }
  if (rating === 'again') return { title: r.levelBefore === 0 && !r.isNew ? '再練一次' : '拆回地基', sub: '別擔心，等一下再見，答出來才算過關', next };
  if (r.repaired) return { title: '修好了！', sub: `${word.word} 恢復${LEVEL_NAMES[r.levelAfter]}的樣子`, next };
  if (rating === 'hard') return { title: '地基穩住了', sub: `維持${LEVEL_NAMES[r.levelAfter]}，下次早點回來`, next };
  if (r.levelAfter === r.levelBefore) return { title: '地標巡禮完成', sub: `${word.word} 依然閃亮`, next };
  return { title: '加蓋一層！', sub: `${word.word} 從${LEVEL_NAMES[r.levelBefore]}蓋到${LEVEL_NAMES[r.levelAfter]}`, next };
}

function Done({ word, result, onNext, onUndo }: { word: Word; result: { rating: Rating; r: RatingResult; requeued: boolean; resting: boolean }; onNext: () => void; onUndo: () => void }) {
  const copy = doneCopy(word, result.rating, result.r, result.requeued, result.resting);
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
      <div className="row gap-12">
        <button type="button" className="btn-ghost big" onClick={onUndo}>按錯了，重評</button>
        <button type="button" className="btn-primary big grow" onClick={onNext} autoFocus>下一個字</button>
      </div>
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
