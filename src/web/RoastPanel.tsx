import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPace, parsePace } from '../shared/pace.js';
import type { PaceSample, Roast } from '../shared/types.js';
import { api, type SessionWithThreshold } from './api.js';

/** Pace series used by the scripted demo: on target, then a slow patch. */
const DEMO_SERIES: Array<{ paceSecPerKm: number; distanceKm: number }> = [
  { paceSecPerKm: 292, distanceKm: 1 },
  { paceSecPerKm: 298, distanceKm: 2 },
  { paceSecPerKm: 318, distanceKm: 3 },
  { paceSecPerKm: 341, distanceKm: 4 },
  { paceSecPerKm: 352, distanceKm: 5 },
  { paceSecPerKm: 296, distanceKm: 6 },
];

export function RoastPanel({ reloadKey }: { reloadKey: number }) {
  const [session, setSession] = useState<SessionWithThreshold | null>(null);
  const [samples, setSamples] = useState<PaceSample[]>([]);
  const [roasts, setRoasts] = useState<Roast[]>([]);
  const [paceInput, setPaceInput] = useState('5:45');
  const [distanceInput, setDistanceInput] = useState('3');
  const [customRoast, setCustomRoast] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const lastPlayedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { sessions } = await api.listSessions();
    const first = sessions[0];
    if (!first) return;
    const detail = await api.getSession(first.id);
    setSession(detail.session);
    setSamples(detail.samples);
    setRoasts(detail.roasts);
  }, []);

  useEffect(() => {
    load().catch((err: Error) => setStatus(err.message));
  }, [load, reloadKey]);

  useEffect(() => {
    const latest = roasts[0];
    if (!autoplay || !latest?.audio || lastPlayedRef.current === latest.id) return;
    lastPlayedRef.current = latest.id;
    void new Audio(latest.audio.url).play().catch(() => undefined);
  }, [roasts, autoplay]);

  const patch = async (changes: Partial<SessionWithThreshold>) => {
    if (!session) return;
    try {
      const { session: updated } = await api.updateSession(session.id, changes);
      setSession(updated);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const sendSample = async (paceSecPerKm: number, distanceKm: number) => {
    if (!session) return;
    const result = await api.addSample(session.id, { paceSecPerKm, distanceKm });
    setSamples((prev) => [...prev, result.sample]);
    if (result.roast) setRoasts((prev) => [result.roast as Roast, ...prev]);
    setStatus(
      result.roast
        ? `🔥 Roast fired (${result.decision.reason}) at ${formatPace(paceSecPerKm)}`
        : `No roast: ${result.decision.reason} at ${formatPace(paceSecPerKm)}`,
    );
  };

  const runDemo = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api.updateSession(session.id, { cooldownSec: 0 });
      for (const point of DEMO_SERIES) {
        await sendSample(point.paceSecPerKm, point.distanceKm);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await load();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!session) return <p className="muted">Loading session…</p>;

  return (
    <div className="grid">
      <section className="card">
        <h2>Session &amp; threshold</h2>
        <label>
          Runner
          <input value={session.runnerName} onChange={(e) => patch({ runnerName: e.target.value })} />
        </label>
        <label>
          Target pace (m:ss per km)
          <input
            defaultValue={formatPace(session.targetPaceSecPerKm).replace('/km', '')}
            onBlur={(e) => patch({ targetPaceSecPerKm: parsePace(e.target.value) })}
          />
        </label>
        <label>
          Tolerance: {(session.tolerancePct * 100).toFixed(0)}% slower allowed
          <input
            type="range"
            min={0}
            max={0.3}
            step={0.01}
            value={session.tolerancePct}
            onChange={(e) => patch({ tolerancePct: Number(e.target.value) })}
          />
        </label>
        <label>
          Debounce samples: {session.debounceSamples}
          <input
            type="range"
            min={1}
            max={5}
            value={session.debounceSamples}
            onChange={(e) => patch({ debounceSamples: Number(e.target.value) })}
          />
        </label>
        <label>
          Cooldown: {session.cooldownSec}s
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={session.cooldownSec}
            onChange={(e) => patch({ cooldownSec: Number(e.target.value) })}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={session.sponsorEnabled}
            onChange={(e) => patch({ sponsorEnabled: e.target.checked })}
          />
          Weave in Healf sponsor hook
        </label>
        <p className="muted">
          Roast fires above <strong>{formatPace(session.thresholdSecPerKm)}</strong> (target{' '}
          {formatPace(session.targetPaceSecPerKm)})
        </p>
      </section>

      <section className="card">
        <h2>Feed a pace sample</h2>
        <div className="row">
          <label>
            Pace (m:ss)
            <input value={paceInput} onChange={(e) => setPaceInput(e.target.value)} />
          </label>
          <label>
            Distance (km)
            <input value={distanceInput} onChange={(e) => setDistanceInput(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <button
            disabled={busy}
            onClick={() =>
              sendSample(parsePace(paceInput), Number(distanceInput) || 0).catch((err: Error) =>
                setStatus(err.message),
              )
            }
          >
            Send sample
          </button>
          <button className="secondary" disabled={busy} onClick={runDemo}>
            ▶ Run scripted demo
          </button>
        </div>
        <label>
          Custom roast text (optional)
          <input
            value={customRoast}
            placeholder="Leave blank to auto-generate"
            onChange={(e) => setCustomRoast(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            api
              .manualRoast(session.id, { text: customRoast || undefined, paceSecPerKm: parsePace(paceInput) })
              .then(({ roast }) => {
                setRoasts((prev) => [roast, ...prev]);
                setStatus('🎙️ Manual roast generated');
              })
              .catch((err: Error) => setStatus(err.message))
          }
        >
          Generate roast now
        </button>
        <label className="checkbox">
          <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
          Auto-play newest roast
        </label>
        {status && <p className="status">{status}</p>}
        <p className="muted">
          {samples.length} samples · last{' '}
          {samples.length ? formatPace(samples[samples.length - 1].paceSecPerKm) : '—'}
        </p>
      </section>

      <section className="card card--wide">
        <h2>Roast feed ({roasts.length})</h2>
        {roasts.length === 0 && <p className="muted">No roasts yet. Slow down a bit.</p>}
        {roasts.map((roast) => (
          <article key={roast.id} className="roast">
            <div className="roast__meta">
              <span className={`badge badge--${roast.trigger === 'threshold' ? 'live' : 'mock'}`}>
                {roast.trigger}
              </span>
              {roast.paceSecPerKm && <span className="muted">{formatPace(roast.paceSecPerKm)}</span>}
              {roast.sponsorHook && <span className="badge badge--sponsor">{roast.sponsorHook.sponsor}</span>}
              {roast.audio && <span className="muted">{roast.audio.provider} voice</span>}
            </div>
            <p>{roast.text}</p>
            {roast.audio ? (
              <audio controls src={roast.audio.url} />
            ) : (
              <p className="error-inline">Audio failed: {roast.audioError}</p>
            )}
            {roast.sponsorHook && (
              <a className="sponsor-cta" href={roast.sponsorHook.ctaUrl} target="_blank" rel="noreferrer">
                {roast.sponsorHook.tagline}
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
