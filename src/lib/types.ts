export type DistrictId =
  | 'speech' | 'truth' | 'praise' | 'change' | 'caution' | 'pride' | 'plenty' | 'conflict'
  | 'mind' | 'clarity' | 'virtue' | 'mood' | 'effort' | 'will' | 'time' | 'dock';

export type Rating = 'again' | 'hard' | 'good';

/** Memory state of a learned word. A word with no Srs has no building yet. */
export interface Srs {
  /** 0 = foundation … 5 = landmark */
  level: number;
  /** Start of the local day (ms) the word is next due. */
  due: number;
  lapses: number;
  reps: number;
  introducedAt: number;
  lastAt: number;
}

export interface Word {
  /** Lower-cased word, also the dedupe key. */
  id: string;
  word: string;
  zh: string;
  pos: string;
  /** KK phonetic transcription without brackets, e.g. loˋkweʃəs. */
  kk?: string;
  example: string;
  district: DistrictId;
  /** Order new words are introduced in. */
  order: number;
  source: 'builtin' | 'import';
  srs: Srs | null;
  /** Last time the word itself (meaning, district…) was changed; decides sync conflicts. */
  editedAt?: number;
}

export interface LogEntry {
  id?: number;
  at: number;
  wordId: string;
  rating: Rating;
  isNew: boolean;
  levelBefore: number;
  levelAfter: number;
}

export interface Settings {
  /** New words introduced per day; each person picks their own on first visit. */
  dailyNew: number;
  onboarded: boolean;
  /** Read the word aloud when a card appears. */
  autoSpeak: boolean;
  /** Which new words come first: the built-in mix of districts, one chosen district, or a daily shuffle. */
  studyOrder: StudyOrder;
  focusDistrict: DistrictId;
  /** Seconds the front of a card waits before it can be flipped, so the answer is recalled, not recognised. */
  thinkSeconds: number;
  /** Hold back new words while the review backlog is large. */
  pauseNewOnBacklog: boolean;
  /** GRE date as YYYY-MM-DD, or '' when not set. */
  examDate: string;
  updatedAt?: number;
}

export const DAILY_MIN = 1;
export const DAILY_MAX = 500;
export type StudyOrder = 'mixed' | 'district' | 'random';

export const DEFAULT_SETTINGS: Settings = { dailyNew: 20, onboarded: false, autoSpeak: true, studyOrder: 'mixed', focusDistrict: 'speech', thinkSeconds: 3, pauseNewOnBacklog: true, examDate: '' };
