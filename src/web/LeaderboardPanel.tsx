import { useCallback, useEffect, useState } from 'react';
import { formatPace, parsePace } from '../shared/pace.js';
import type { LeaderboardEntry, LeaderboardMetric, RunActivity, StravaStatus } from '../shared/types.js';
import { api } from './api.js';

const METRICS: Array<[LeaderboardMetric, string]> = [
  ['distance', 'Total distance'],
  ['pace', 'Best pace'],
  ['roasts', 'Most roasted'],
];

export function LeaderboardPanel({ reloadKey }: { reloadKey: number }) {
  const [metric, setMetric] = useState<LeaderboardMetric>('distance');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [activities, setActivities] = useState<RunActivity[]>([]);
  const [strava, setStrava] = useState<StravaStatus | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ runnerName: 'Isaac', name: 'Lunch run', distance: '8', pace: '5:20' });

  const load = useCallback(async () => {
    const [board, { activities: list }, { strava: stravaStatus }] = await Promise.all([
      api.leaderboard(metric),
      api.listActivities(),
      api.stravaStatus(),
    ]);
    setEntries(board.entries);
    setActivities(list);
    setStrava(stravaStatus);
  }, [metric]);

  useEffect(() => {
    setStatus(null);
    load().catch((err: Error) => setStatus(err.message));
  }, [load, reloadKey]);

  const logRun = async () => {
    setBusy(true);
    try {
      const distanceKm = Number(form.distance);
      await api.addActivity({
        runnerName: form.runnerName,
        name: form.name,
        distanceKm,
        durationSec: Math.round(parsePace(form.pace) * distanceKm),
      });
      setStatus(`Logged ${distanceKm}km for ${form.runnerName}`);
      await load();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const syncStrava = async () => {
    setBusy(true);
    try {
      const { imported, skipped } = await api.stravaSync();
      setStatus(`Strava sync: ${imported.length} imported, ${skipped} already known`);
      await load();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connectStrava = async () => {
    setBusy(true);
    try {
      const { strava: connected } = await api.stravaConnect('mock-authorization-code');
      setStrava(connected);
      setStatus(
        connected.mode === 'mock'
          ? 'Connected to the Strava mock — sync to pull demo activities.'
          : 'Strava connected.',
      );
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <section className="card card--wide">
        <h2>Leaderboard</h2>
        <div className="row">
          {METRICS.map(([key, label]) => (
            <button
              key={key}
              className={metric === key ? 'tab tab--active' : 'tab'}
              onClick={() => setMetric(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {entries.length === 0 && <p className="muted">No runs logged yet.</p>}
        {entries.length > 0 && (
          <table className="board">
            <thead>
              <tr>
                <th>#</th>
                <th>Runner</th>
                <th>Runs</th>
                <th>Distance</th>
                <th>Avg pace</th>
                <th>Best pace</th>
                <th>Roasts</th>
                <th>Bets W/M</th>
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.runnerName}>
                  <td>{entry.rank}</td>
                  <td>{entry.runnerName}</td>
                  <td>{entry.runCount}</td>
                  <td>{entry.totalDistanceKm}km</td>
                  <td>{entry.avgPaceSecPerKm === null ? '—' : formatPace(entry.avgPaceSecPerKm)}</td>
                  <td>{entry.bestPaceSecPerKm === null ? '—' : formatPace(entry.bestPaceSecPerKm)}</td>
                  <td>{entry.roastCount}</td>
                  <td>
                    {entry.betsWon}/{entry.betsMissed}
                  </td>
                  <td className="muted">{entry.sources.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {status && <p className="status">{status}</p>}
      </section>

      <section className="card">
        <h2>Log a run</h2>
        {(
          [
            ['runnerName', 'Runner'],
            ['name', 'Run name'],
            ['distance', 'Distance (km)'],
            ['pace', 'Average pace (m:ss)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </label>
        ))}
        <button disabled={busy} onClick={logRun}>
          Add to leaderboard
        </button>
      </section>

      <section className="card">
        <h2>
          Strava tracking{' '}
          {strava && <span className={`badge badge--${strava.mode}`}>{strava.mode}</span>}
        </h2>
        <p className="muted">
          {strava?.connected
            ? `Connected${strava.athleteName ? ` as ${strava.athleteName}` : ''}${
                strava.lastSyncAt ? ` · last sync ${new Date(strava.lastSyncAt).toLocaleTimeString()}` : ''
              }`
            : 'Not connected. In mock mode the connect button returns fixture tokens; with real credentials use the authorize link.'}
        </p>
        {strava?.authorizeUrl && strava.mode === 'live' && (
          <a className="sponsor-cta" href={strava.authorizeUrl}>
            Authorize with Strava →
          </a>
        )}
        <div className="row">
          <button className="secondary" disabled={busy} onClick={connectStrava}>
            Connect
          </button>
          <button disabled={busy || !strava?.connected} onClick={syncStrava}>
            Sync activities
          </button>
        </div>
      </section>

      <section className="card card--wide">
        <h2>Recent activities ({activities.length})</h2>
        {activities.length === 0 && <p className="muted">Nothing logged yet.</p>}
        {activities.map((activity) => (
          <article key={activity.id} className="roast">
            <div className="roast__meta">
              <span className="badge">{activity.source}</span>
              <strong>{activity.runnerName}</strong>
              <span className="muted">
                {activity.name} · {activity.distanceKm}km · {formatPace(activity.avgPaceSecPerKm)} ·{' '}
                {new Date(activity.startedAt).toLocaleDateString()}
              </span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
