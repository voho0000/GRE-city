import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

interface FakeUtterance { text: string; onstart?: () => void; onerror?: (e: { error: string }) => void; volume?: number }

function setup(ua: string, opts: { voices?: { lang: string; name: string; localService: boolean }[]; startsSpeaking?: boolean; speaking?: boolean } = {}) {
  const spoken: string[] = [];
  const played: string[] = [];
  const synth = {
    speaking: opts.speaking ?? false,
    pending: false,
    getVoices: () => opts.voices ?? [{ lang: 'en-US', name: 'Samantha', localService: true }],
    addEventListener: () => {},
    cancel: vi.fn(() => { synth.speaking = false; }),
    resume: vi.fn(),
    speak: vi.fn((u: FakeUtterance) => {
      if (u.text.trim()) spoken.push(u.text);
      if (opts.startsSpeaking !== false) u.onstart?.();
    }),
  };
  class Utterance { text: string; lang = ''; rate = 1; voice: unknown = null; volume = 1; onstart?: () => void; onerror?: (e: { error: string }) => void; constructor(t: string) { this.text = t; } }
  class FakeAudio { src = ''; pause() {} play() { played.push(this.src); return Promise.resolve(); } }
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints: ua.includes('iPhone') ? 5 : 0 });
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ phonetics: [{ audio: '' }, { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/laud-us.mp3' }] }] })));
  return { spoken, played, synth };
}

async function load() {
  vi.resetModules();
  return import('../speech');
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('speech', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('recognises iPhones and iPads in any browser', async () => {
    setup(ANDROID_CHROME);
    const { isAppleMobile } = await load();
    expect(isAppleMobile(IPHONE_CHROME, 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 0)).toBe(false);
    expect(isAppleMobile(ANDROID_CHROME, 5)).toBe(false);
  });

  it('plays the online recording on an iPhone, unaffected by the silent switch', async () => {
    const { spoken, played } = setup(IPHONE_CHROME);
    const { speak } = await load();
    speak('laud');
    await flush();
    expect(played).toEqual(['https://api.dictionaryapi.dev/media/pronunciations/en/laud-us.mp3']);
    expect(spoken).toEqual([]);
  });

  it('falls back to another recording when the dictionary has none', async () => {
    setup(IPHONE_CHROME);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const { recordingFor } = await load();
    expect(await recordingFor('Obsequious')).toBe('https://dict.youdao.com/dictvoice?audio=obsequious&type=2');
  });

  it('uses the device voice on Android, waiting a moment after stopping the previous word', async () => {
    const { spoken, synth } = setup(ANDROID_CHROME, { speaking: true });
    const { speak } = await load();
    speak('laud');
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken).toEqual([]);
    await vi.advanceTimersByTimeAsync(150);
    expect(spoken).toEqual(['laud']);
  });

  it('switches to the recording when the device voice never starts', async () => {
    const { played } = setup(ANDROID_CHROME, { startsSpeaking: false });
    const { speak } = await load();
    speak('laud');
    await vi.advanceTimersByTimeAsync(1600);
    await flush();
    expect(played).toHaveLength(1);
  });

  it('uses the recording when the device has no English voice', async () => {
    const { played, spoken } = setup(ANDROID_CHROME, { voices: [{ lang: 'zh-TW', name: 'Mei-Jia', localService: true }] });
    const { speak } = await load();
    speak('laud');
    await flush();
    expect(played).toHaveLength(1);
    expect(spoken).toEqual([]);
  });

  it('honours an explicit choice of device voice, even on an iPhone', async () => {
    const { played, spoken } = setup(IPHONE_CHROME);
    const { speak } = await load();
    speak('laud', 'device');
    expect(spoken).toEqual(['laud']);
    expect(played).toEqual([]);
  });
});
