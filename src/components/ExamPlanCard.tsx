import { useState } from 'react';
import { BUFFER_DAYS, examPlan } from '../lib/plan';
import { useStore } from '../lib/store';
import { DAILY_MAX } from '../lib/types';

function md(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Exam countdown: how many new words a day it takes to finish the list two weeks before the GRE. */
export function ExamPlanCard({ remaining }: { remaining: number }) {
  const { settings, setSettings } = useStore();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(settings.examDate);
  const plan = settings.examDate ? examPlan(settings.examDate, Date.now(), remaining, settings.dailyNew) : null;

  if (editing || !plan) {
    return (
      <div className="exam">
        <label className="field">
          <span className="small muted">GRE 考試日期</span>
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="row gap-12">
          <button type="button" className="btn-ghost" disabled={!value} onClick={() => { setSettings({ examDate: value }); setEditing(false); }}>儲存</button>
          {settings.examDate && <button type="button" className="btn-text" onClick={() => { setSettings({ examDate: '' }); setValue(''); setEditing(false); }}>清除日期</button>}
        </div>
      </div>
    );
  }

  const fix = Math.min(DAILY_MAX, plan.needed);
  return (
    <div className="exam">
      <div className="row-between">
        <span><b className="latin exam-days">{Math.max(0, plan.daysLeft)}</b> <span className="small">天後考試</span></span>
        <button type="button" className="btn-text" onClick={() => setEditing(true)}>{settings.examDate.replaceAll('-', '/')} · 更改</button>
      </div>
      {plan.daysLeft < 0 ? (
        <span className="small muted">考試日期已過，可以設定下一次的日期。</span>
      ) : plan.remaining === 0 ? (
        <span className="small ok-text">所有新字都蓋好了，接下來把建築升級成地標。</span>
      ) : plan.onTrack ? (
        <span className="small muted">照每天 {settings.dailyNew} 個，約 {md(plan.finishAt!)} 蓋完剩下 {plan.remaining} 個新字，考前還有時間複習。</span>
      ) : (
        <div className="stack-6">
          <span className="small warn-text">照每天 {settings.dailyNew} 個背不完：要在考前 {BUFFER_DAYS} 天蓋完剩下 {plan.remaining} 個新字，每天至少要 {plan.needed} 個。</span>
          {fix > settings.dailyNew && <button type="button" className="btn-ghost" onClick={() => setSettings({ dailyNew: fix })}>改成每天 {fix} 個</button>}
        </div>
      )}
    </div>
  );
}
