import { useState } from 'react';
import { isAppleMobile, prefersRecording } from '../lib/speech';
import { useStore } from '../lib/store';

const KEY = 'gre-city-silent-tip-dismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Web pages cannot read the iPhone's ring/silent switch, so when the device voice (which that switch mutes) is
 * in use on an iPhone or iPad, say so once and offer the recordings, which play either way.
 */
export function SilentModeTip() {
  const { settings, setSettings } = useStore();
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  if (!isAppleMobile() || prefersRecording(settings.voiceSource)) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Private mode: the tip just shows again next time.
    }
    setHidden(true);
  };
  return (
    <div className="notice" role="status">
      <b>聽不到發音嗎？</b>
      <span className="small">iPhone 的裝置語音在靜音模式下不會出聲，請把手機側邊的靜音開關關掉。也可以改用線上真人錄音，靜音時也聽得到。</span>
      <div className="row gap-12 wrap">
        <button type="button" className="btn-text" onClick={() => { setSettings({ voiceSource: 'online' }); close(); }}>改用線上錄音</button>
        <button type="button" className="btn-text" onClick={close}>知道了</button>
      </div>
    </div>
  );
}
