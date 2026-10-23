/** Reads English words aloud with the browser's built-in voices (no network needed on most devices). */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

let voice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const us = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'en-us');
  const preferred = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex'];
  return (
    us.find((v) => preferred.some((p) => v.name.includes(p))) ??
    us.find((v) => v.localService) ??
    us[0] ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  );
}

if (canSpeak()) speechSynthesis.addEventListener?.('voiceschanged', () => (voice = pickVoice()));

export function speak(text: string): void {
  if (!canSpeak()) return;
  if (voice === undefined) voice = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.85;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
