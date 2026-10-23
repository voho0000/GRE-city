import { addDays, daysBetween } from './time';

/** New words should be finished this long before the exam, so the last ones still get a few reviews. */
export const BUFFER_DAYS = 14;

export interface ExamPlan {
  daysLeft: number;
  remaining: number;
  /** New words a day needed to finish BUFFER_DAYS before the exam. */
  needed: number;
  /** When the remaining new words run out at the current pace (null if there are none left). */
  finishAt: number | null;
  onTrack: boolean;
}

export function examPlan(examDate: string, now: number, remaining: number, dailyNew: number): ExamPlan | null {
  const exam = new Date(`${examDate}T00:00:00`).getTime();
  if (Number.isNaN(exam)) return null;
  const daysLeft = daysBetween(now, exam);
  const window = Math.max(1, daysLeft - BUFFER_DAYS);
  const needed = remaining ? Math.ceil(remaining / window) : 0;
  const finishAt = remaining ? addDays(now, Math.ceil(remaining / Math.max(1, dailyNew)) - 1) : null;
  return { daysLeft, remaining, needed, finishAt, onTrack: dailyNew >= needed };
}
