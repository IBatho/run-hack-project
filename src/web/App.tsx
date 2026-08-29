import { useCallback, useEffect, useState } from 'react';
import type { ProviderStatus } from '../shared/types.js';
import { api } from './api.js';
import { BetPanel } from './BetPanel.js';
import { LeaderboardPanel } from './LeaderboardPanel.js';
import { RoastPanel } from './RoastPanel.js';
import { TrackerPanel } from './TrackerPanel.js';

type Tab = 'roast' | 'bet' | 'tracker' | 'leaderboard';

export function App() {
  const [tab, setTab] = useState<Tab>('roast');
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api
      .health()
      .then((res) => setProviders(res.providers))
      .catch((err: Error) => setError(err.message));
  }, [reloadKey]);

  const reset = useCallback(async () => {
    try {
      await api.reset();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Run Hack</h1>
          <p className="subtitle">Audio Roast Engine · Ghost Pacer Bet · Live Tracker · Leaderboard</p>
        </div>
        <div className="providers">
          {providers &&
            Object.entries(providers).map(([name, mode]) => (
              <span key={name} className={`badge badge--${mode}`}>
                {name}: {mode}
              </span>
            ))}
          <button className="ghost" onClick={reset}>
            Reset demo data
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        <button className={tab === 'roast' ? 'tab tab--active' : 'tab'} onClick={() => setTab('roast')}>
          🔥 Audio Roast Engine
        </button>
        <button className={tab === 'bet' ? 'tab tab--active' : 'tab'} onClick={() => setTab('bet')}>
          👻 Ghost Pacer Bet
        </button>
        <button className={tab === 'tracker' ? 'tab tab--active' : 'tab'} onClick={() => setTab('tracker')}>
          📍 Live Tracker
        </button>
        <button
          className={tab === 'leaderboard' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('leaderboard')}
        >
          🏆 Leaderboard
        </button>
      </nav>

      <main>
        {tab === 'roast' && <RoastPanel reloadKey={reloadKey} />}
        {tab === 'bet' && <BetPanel reloadKey={reloadKey} />}
        {tab === 'tracker' && <TrackerPanel reloadKey={reloadKey} />}
        {tab === 'leaderboard' && <LeaderboardPanel reloadKey={reloadKey} />}
      </main>
    </div>
  );
}
