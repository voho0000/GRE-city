/**
 * Reads English words aloud, either with the device's own voice (works offline) or an online recording.
 *
 * On iPhone and iPad (every browser there is Safari underneath) the device voice is silenced by the ring/silent
 * switch and refuses to play until a tap has started some sound, so there the recording comes first. Elsewhere the
 * device voice comes first and the recording covers devices without an English voice.
 */

export type VoiceSource = 'auto' | 'device' | 'online';

export function isAppleMobile(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): boolean {
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
}

export function prefersRecording(source: VoiceSource): boolean {
  return source === 'online' || (source === 'auto' && isAppleMobile());
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/** Pronunciation is always offered: the online recording covers devices without a usable voice. */
export function canPronounce(): boolean {
  return typeof window !== 'undefined' && (canSpeak() || typeof Audio !== 'undefined');
}

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const isUS = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase() === 'en-us';
  const us = voices.filter(isUS);
  const preferred = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex'];
  return (
    us.find((v) => v.localService && preferred.some((p) => v.name.includes(p))) ??
    us.find((v) => v.localService) ??
    us[0] ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  );
}

if (canSpeak()) speechSynthesis.addEventListener?.('voiceschanged', () => (voice = pickVoice()));

function hasEnglishVoice(): boolean {
  const voices = speechSynthesis.getVoices();
  // Some browsers list no voices until first use; then let the voice try and fall back if it never starts.
  return !voices.length || voices.some((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en'));
}

// Chrome drops an utterance that is only referenced by the speech queue, cutting it off; keep it reachable.
let current: SpeechSynthesisUtterance | null = null;
// One element for every recording: iOS only lets an element play on its own once a tap has played it.
let audio: HTMLAudioElement | null = null;
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** Called from the first tap: lets later, untapped playback (auto-speak) through on iOS. */
function unlock(): void {
  if (typeof Audio !== 'undefined') {
    audio ??= new Audio();
    if (!audio.src) {
      audio.src = SILENT_WAV;
      audio.play().catch(() => {});
    }
  }
  if (canSpeak()) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

if (typeof document !== 'undefined') {
  const once = () => {
    unlock();
    document.removeEventListener('touchend', once, true);
    document.removeEventListener('click', once, true);
  };
  document.addEventListener('touchend', once, true);
  document.addEventListener('click', once, true);
}
const recordingUrl = new Map<string, string>();

/** A recording of the word: dictionaryapi.dev (real speakers) when it has one, else Youdao's US voice. */
export async function recordingFor(word: string, fetcher: typeof fetch = fetch): Promise<string> {
  const key = word.toLowerCase();
  const cached = recordingUrl.get(key);
  if (cached) return cached;
  let url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(key)}&type=2`;
  try {
    const res = await fetcher(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (res.ok) {
      const entries = (await res.json()) as { phonetics?: { audio?: string }[] }[];
      const files = entries.flatMap((e) => e.phonetics ?? []).map((p) => p.audio ?? '').filter(Boolean);
      url = files.find((a) => /-us\.mp3$/.test(a)) ?? files[0] ?? url;
    }
  } catch {
    // Offline or blocked: the fallback URL still gets a try.
  }
  recordingUrl.set(key, url);
  return url;
}

/** Plays the online recording; resolves false when it could not play (offline, or not allowed yet). */
async function playRecording(word: string): Promise<boolean> {
  try {
    audio ??= new Audio();
    audio.pause();
    audio.src = await recordingFor(word);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

/** How long a voice gets to start before the recording takes over. */
const START_TIMEOUT_MS = 1500;

export function speak(text: string, source: VoiceSource = 'auto'): void {
  if (source !== 'device' && (prefersRecording(source) || !canSpeak() || !hasEnglishVoice())) {
    // Offline or blocked: the device voice is the last resort.
    void playRecording(text).then((ok) => {
      if (!ok && canSpeak() && source !== 'online') speakWithDevice(text);
    });
    return;
  }
  if (canSpeak()) speakWithDevice(text);
}

function speakWithDevice(text: string): void {
  const synth = speechSynthesis;
  const start = () => {
    if (voice === undefined) voice = pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    if (voice) u.voice = voice;
    let started = false;
    u.onstart = () => (started = true);
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled' && e.error !== 'not-allowed') void playRecording(text);
    };
    current = u;
    synth.resume();
    synth.speak(u);
    setTimeout(() => {
      if (!started && current === u) {
        synth.cancel();
        void playRecording(text);
      }
    }, START_TIMEOUT_MS);
  };
  // Android Chrome silently drops an utterance queued right after cancel(); cancel only when something is
  // playing, and give the engine a moment before speaking again.
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(start, 120);
  } else {
    start();
  }
}
