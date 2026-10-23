import { useState } from 'react';
import { DAILY_MAX, DAILY_MIN } from '../lib/types';

const PRESETS = [10, 20, 30, 50];

/** Picks how many new words (buildings) to start each day. */
export function DailyGoal({ initial, remaining, confirmLabel, onConfirm, onCancel }: { initial: number; remaining: number; confirmLabel: string; onConfirm: (n: number) => void; onCancel?: () => void }) {
  const [value, setValue] = useState(String(initial));
  const n = Math.round(Number(value));
  const valid = Number.isFinite(n) && n >= DAILY_MIN && n <= DAILY_MAX;
  return (
    <div className="stack-10">
      <div className="presets" role="group" aria-label="常用數量">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`preset${n === p ? ' on' : ''}`} aria-pressed={n === p} onClick={() => setValue(String(p))}>
            {p}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="small muted">或自己輸入（{DAILY_MIN}–{DAILY_MAX}）</span>
        <input type="number" inputMode="numeric" min={DAILY_MIN} max={DAILY_MAX} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {valid && remaining > 0 && <span className="small muted">字庫還有 {remaining} 個新字，約 {Math.ceil(remaining / n)} 天蓋完；每天還會加上到期的複習。</span>}
      <div className="row gap-12 wrap">
        <button type="button" className="btn-primary" disabled={!valid} onClick={() => onConfirm(n)}>{confirmLabel}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>取消</button>}
      </div>
    </div>
  );
}
