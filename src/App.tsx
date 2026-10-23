import { useEffect, useMemo, useState } from 'react';
import { DISTRICTS } from './data/districts';
import { buildQueue, newIntroducedToday } from './lib/srs';
import { SyncBadge } from './components/SyncPanel';
import { useStore } from './lib/store';
import { dayKey, startOfDay, streakDays } from './lib/time';
import { CityScreen } from './screens/CityScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { StatsScreen } from './screens/StatsScreen';
import { StudyScreen } from './screens/StudyScreen';

type Route = 'city' | 'study' | 'practice' | 'library' | 'stats';
const ROUTES: { id: Route; label: string }[] = [
  { id: 'city', label: '城市' },
  { id: 'study', label: '複習' },
  { id: 'practice', label: '練習' },
  { id: 'library', label: '字庫' },
  { id: 'stats', label: '統計' },
];

function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.some((x) => x.id === r) ? r : 'city';
}

export function App() {
  const { ready, words, logs, settings } = useStore();
  const [route, setRoute] = useState<Route>(readRoute);
  const [studyKey, setStudyKey] = useState(0);

  useEffect(() => {
    const on = () => {
      const r = readRoute();
      setRoute(r);
      // A fresh visit to the study screen starts a fresh queue.
      if (r === 'study' || r === 'practice') setStudyKey((k) => k + 1);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const info = useMemo(() => {
    const now = Date.now();
    const t0 = startOfDay(now);
    return {
      queue: buildQueue(words, now, settings.dailyNew, settings).length,
      newToday: newIntroducedToday(words, now),
      reviewsToday: logs.filter((l) => l.at >= t0 && !l.isNew).length,
      built: words.filter((w) => w.srs).length,
      landmarks: words.filter((w) => w.srs?.level === 5).length,
      streak: streakDays(new Set(logs.map((l) => dayKey(l.at))), now),
    };
  }, [words, logs, settings]);

  if (!ready) return <div className="loading">正在打開城門…</div>;

  return (
    <div className={`app route-${route}`}>
      <header className="topbar">
        <a className="brand" href="#/city">
          <span className="brand-zh">字城</span>
          <span className="brand-en latin">GRE CITY</span>
        </a>
        <nav aria-label="主選單" className="nav">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>{r.label}</a>
          ))}
        </nav>
        <div className="grow" />
        <SyncBadge />
        <div className="top-stats small muted">
          <span><b className="latin">{info.built}</b> 棟</span>
          <span><b className="latin">{info.landmarks}</b> 地標</span>
          <span><b className="latin">{info.streak}</b> 天連續</span>
        </div>
      </header>
      {route === 'city' && <CityScreen queueSize={info.queue} newToday={info.newToday} reviewsDone={info.reviewsToday} />}
      {route === 'study' && <StudyScreen key={studyKey} />}
      {route === 'practice' && <PracticeScreen key={studyKey} />}
      {route === 'library' && <LibraryScreen />}
      {route === 'stats' && <StatsScreen />}
      <footer className="foot small muted">
        {DISTRICTS.length} 個街區 · 資料存在這台裝置的瀏覽器，可在字庫頁開啟跨裝置同步
      </footer>
    </div>
  );
}
