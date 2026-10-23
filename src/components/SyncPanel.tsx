import { useState } from 'react';
import { useStore } from '../lib/store';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=GRE%20City%20sync';

export function timeAgo(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.round(h / 24)} 天前`;
}

export function SyncPanel() {
  const { sync, connectSync, disconnectSync, syncNow } = useStore();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await connectSync(token);
      setToken('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '連結失敗');
    } finally {
      setBusy(false);
    }
  };

  if (sync.config) {
    const { login, lastAt, gistUrl } = sync.config;
    return (
      <section className="card stack">
        <h2 className="h2">跨裝置同步</h2>
        <p className="small">
          已連結 GitHub 帳號 <b className="latin">{login}</b>，進度存在你的
          <a href={gistUrl} target="_blank" rel="noreferrer">秘密 Gist</a>。
          打開 App、背完一段、切到別的 App 時都會自動同步。
        </p>
        <p className="small muted" role="status">
          {sync.status === 'syncing' ? '同步中…' : sync.status === 'error' ? <span className="warn-text">同步失敗：{sync.error}</span> : lastAt ? `上次同步：${timeAgo(lastAt)}` : '尚未同步'}
        </p>
        <div className="row wrap gap-12">
          <button type="button" className="btn-primary" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>立即同步</button>
          <button type="button" className="btn-ghost" onClick={() => { if (confirm('中斷這台裝置的同步？資料會留在這台裝置和 Gist 上。')) disconnectSync(); }}>中斷連結</button>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <h2 className="h2">跨裝置同步</h2>
      <p className="small muted">把進度存到你 GitHub 帳號的秘密 Gist，電腦和手機各連結一次，就會自動合併兩邊背過的字。</p>
      <ol className="steps small">
        <li><a href={TOKEN_URL} target="_blank" rel="noreferrer">開啟 GitHub 產生 token</a>（已預先勾好 <span className="latin">gist</span> 權限），Expiration 可選 No expiration，按 Generate token。</li>
        <li>複製產生的 token（<span className="latin">ghp_</span> 開頭），貼到下面。</li>
        <li>另一台裝置也貼同一個 token。</li>
      </ol>
      <label className="field">
        <span className="small muted">GitHub token</span>
        <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
      </label>
      <div className="row wrap gap-12">
        <button type="button" className="btn-primary" disabled={!token.trim() || busy} onClick={connect}>{busy ? '連結中…' : '連結並同步'}</button>
      </div>
      {error && <p className="small warn-text" role="alert">{error}</p>}
      <p className="tiny muted">token 只存在這台裝置的瀏覽器，只用來讀寫你的 Gist。秘密 Gist 不會公開列出，但知道網址的人看得到內容。</p>
    </section>
  );
}

/** Small status in the top bar; tap to open the sync settings. */
export function SyncBadge() {
  const { sync } = useStore();
  if (!sync.config) return null;
  const label = sync.status === 'syncing' ? '同步中…' : sync.status === 'error' ? '同步失敗' : sync.config.lastAt ? `已同步 · ${timeAgo(sync.config.lastAt)}` : '等待同步';
  return (
    <a href="#/library" className={`sync-badge small${sync.status === 'error' ? ' warn-text' : ''}`} title={sync.error ?? undefined}>{label}</a>
  );
}
