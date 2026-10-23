import { useEffect, useState } from 'react';
import { makeQuestions, type Question } from '../lib/practice';
import { isDue } from '../lib/srs';
import { useStore } from '../lib/store';

const ROUND = 10;

/**
 * Sentence-equivalence drill: of six words, pick the two that mean the same. Answers count as reviews only for
 * words that are due today, so practising never pushes a word ahead of its schedule.
 */
export function PracticeScreen() {
  const [round, setRound] = useState(0);
  return <Round key={round} onAgain={() => setRound((r) => r + 1)} />;
}

function Round({ onAgain }: { onAgain: () => void }) {
  const { words, byId, rate } = useStore();
  const [questions] = useState<Question[]>(() => makeQuestions(words, ROUND));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [checked, setChecked] = useState<{ correct: boolean; updated: number } | null>(null);
  const [score, setScore] = useState({ correct: 0, updated: 0 });
  const [busy, setBusy] = useState(false);

  const q = questions[i];
  const done = i >= questions.length;

  const toggle = (id: string) => {
    if (checked) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]));
  };

  const check = async () => {
    if (!q || picked.length !== 2 || checked || busy) return;
    setBusy(true);
    const correct = q.answer.every((id) => picked.includes(id));
    let updated = 0;
    const now = Date.now();
    for (const id of q.answer) {
      const w = byId.get(id);
      if (w && isDue(w.srs, now)) {
        await rate(id, correct ? 'good' : 'again');
        updated++;
      }
    }
    setChecked({ correct, updated });
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), updated: s.updated + updated }));
    setBusy(false);
  };

  const next = () => {
    setI((n) => n + 1);
    setPicked([]);
    setChecked(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) toggle(q.options[n - 1]);
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (checked) next();
        else void check();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!questions.length) {
    return (
      <main className="study">
        <div className="card flash center">
          <span className="title-lg">還沒有足夠的字出題</span>
          <span className="muted">題目會從你蓋過的建築和它們的同義字裡出。先去複習頁蓋幾十棟，再回來練習。</span>
          <a className="btn-primary big" href="#/study">去蓋房子</a>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="study">
        <div className="card flash center">
          <span className="title-lg">這輪答對 {score.correct} / {questions.length}</span>
          <span className="muted">{score.updated ? `${score.updated} 棟今天到期的建築已依作答更新。` : '這輪的字今天都還沒到期，建築維持不變。'}</span>
          <div className="row gap-12 wrap center-row">
            <button type="button" className="btn-primary big" onClick={onAgain}>再練一輪</button>
            <a className="btn-ghost big" href="#/city">回城市</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="study">
      <div className="row gap-12">
        <a className="icon-btn" href="#/city" aria-label="回到城市">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </a>
        <div className="grow stack-6">
          <div className="row-between small muted"><span>同義字練習（SE）</span><span>{i + 1} / {questions.length}</span></div>
          <div className="bar"><div style={{ width: `${(i / questions.length) * 100}%`, background: '#1F3A5F' }} /></div>
        </div>
      </div>

      <div className="card stack">
        <span className="h2 lg">哪兩個字意思相同？</span>
        <span className="small muted">選兩個，再按確認。GRE 的 SE 題要選出放進句子後意思一樣的兩個字。</span>
        <div className="options">
          {q.options.map((id, n) => {
            const w = byId.get(id)!;
            const isAnswer = q.answer.includes(id);
            const isPicked = picked.includes(id);
            const state = checked ? (isAnswer ? ' right' : isPicked ? ' wrong' : ' dim') : isPicked ? ' on' : '';
            return (
              <button key={id} type="button" className={`option${state}`} aria-pressed={isPicked} onClick={() => toggle(id)}>
                <span className="latin option-word"><span className="kbd-hint muted small">{n + 1} </span>{w.word}</span>
                {checked && <span className="small">{w.zh}</span>}
              </button>
            );
          })}
        </div>
        {checked && (
          <p className={`small ${checked.correct ? 'ok-text' : 'warn-text'}`} role="status">
            {checked.correct ? '答對了！' : '差一點。'}共同意思：「{q.sense}」
            {checked.updated > 0 && `（${checked.updated} 棟今天到期的建築已${checked.correct ? '升級' : '拆回地基'}）`}
          </p>
        )}
      </div>
      {checked ? (
        <button type="button" className="btn-primary big" onClick={next} autoFocus>下一題</button>
      ) : (
        <button type="button" className="btn-primary big" disabled={picked.length !== 2 || busy} onClick={() => void check()}>確認</button>
      )}
    </main>
  );
}
