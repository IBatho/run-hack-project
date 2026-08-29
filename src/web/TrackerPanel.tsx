import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPace, parsePace } from '../shared/pace.js';
import type { Roast } from '../shared/types.js';
import { api, clipUrl, type SessionWithThreshold } from './api.js';
import { AudioCues } from './tracking/audioCues.js';
import {
  applyFix,
  initialTrackState,
  shouldSendSample,
  simulatedFix,
  type Fix,
  type TrackState,
} from './tracking/geoTrack.js';

/** How often live pace is pushed to the roast engine, which owns debounce/cooldown. */
const SAMPLE_INTERVAL_SEC = 15;
const SIMULATION_STEP_SEC = 5;
const SIMULATION_ORIGIN = { latitude: 51.5074, longitude: -0.1278 };

const durationLabel = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function TrackerPanel({ reloadKey }: { reloadKey: number }) {
  const [sessions, setSessions] = useState<SessionWithThreshold[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [runnerName, setRunnerName] = useState('Isaac');
  const [simulate, setSimulate] = useState(false);
  const [simulatePace, setSimulatePace] = useState('5:40');
  const [tracking, setTracking] = useState(false);
  const [track, setTrack] = useState<TrackState>(initialTrackState);
  const [roasts, setRoasts] = useState<Roast[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cues = useMemo(() => new AudioCues(), []);
  const trackRef = useRef<TrackState>(initialTrackState());
  const lastSentRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationRef = useRef<{ timer: number; index: number; startMs: number } | null>(null);

  const geolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const secureContext = typeof window === 'undefined' || window.isSecureContext;

  useEffect(() => {
    api
      .listSessions()
      .then(({ sessions: list }) => {
        setSessions(list);
        setSessionId((current) => (list.some((s) => s.id === current) ? current : (list[0]?.id ?? '')));
        if (list[0]) setRunnerName((name) => name || list[0].runnerName);
      })
      .catch((err: Error) => setError(err.message));
  }, [reloadKey]);

  const session = sessions.find((item) => item.id === sessionId) ?? null;

  const pushSample = useCallback(
    async (state: TrackState) => {
      if (!sessionId || state.paceSecPerKm <= 0 || state.distanceKm <= 0) return;
      try {
        const { roast } = await api.addSample(sessionId, {
          paceSecPerKm: Math.round(state.paceSecPerKm),
          distanceKm: Number(state.distanceKm.toFixed(3)),
        });
        if (!roast) return;
        setRoasts((current) => [roast, ...current]);
        cues.cue('slow');
        try {
          if (!roast.audio) throw new Error('no clip');
          await cues.playClip(clipUrl(roast.audio.url));
        } catch {
          cues.speak(roast.text);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [cues, sessionId],
  );

  const ingest = useCallback(
    (fix: Fix) => {
      const next = applyFix(trackRef.current, fix);
      trackRef.current = next;
      setTrack(next);

      if (!shouldSendSample(fix.timestamp, lastSentRef.current, SAMPLE_INTERVAL_SEC)) return;
      lastSentRef.current = fix.timestamp;
      void pushSample(next);
    },
    [pushSample],
  );

  const stopSources = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simulationRef.current) {
      window.clearInterval(simulationRef.current.timer);
      simulationRef.current = null;
    }
  }, []);

  useEffect(() => stopSources, [stopSources]);

  const start = async () => {
    setError(null);
    setRoasts([]);
    trackRef.current = initialTrackState();
    setTrack(trackRef.current);
    lastSentRef.current = null;

    // Must happen inside the click handler or mobile browsers keep audio muted.
    await cues.unlock();
    cues.cue('start');

    if (simulate) {
      const paceSecPerKm = Math.max(60, parsePace(simulatePace));
      const startMs = Date.now();
      const timer = window.setInterval(() => {
        const state = simulationRef.current;
        if (!state) return;
        state.index += 1;
        ingest(simulatedFix(SIMULATION_ORIGIN, state.index, paceSecPerKm, SIMULATION_STEP_SEC, state.startMs));
      }, 1000);
      simulationRef.current = { timer, index: 0, startMs };
      setTracking(true);
      setStatus(`Simulating a ${simulatePace}/km run — no GPS permission needed.`);
      return;
    }

    if (!geolocationSupported) {
      setError('This browser has no Geolocation API. Use simulated GPS instead.');
      return;
    }
    if (!secureContext) {
      setError('Geolocation needs HTTPS (or localhost). Open the page over https or use simulated GPS.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) =>
        ingest({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (err) =>
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location for this site, or switch on simulated GPS.'
            : `Geolocation error: ${err.message}`,
        ),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    setTracking(true);
    setStatus('Tracking. Keep this tab in the foreground — browsers throttle background GPS.');
  };

  const finish = async () => {
    stopSources();
    setTracking(false);
    cues.cue('finish');

    const { distanceKm, elapsedSec } = trackRef.current;
    if (distanceKm <= 0 || elapsedSec <= 0) {
      setStatus('Stopped before any distance was recorded — nothing added to the leaderboard.');
      return;
    }

    try {
      await api.addActivity({
        runnerName,
        distanceKm: Number(distanceKm.toFixed(2)),
        durationSec: Math.round(elapsedSec),
        name: 'Browser tracked run',
        source: 'web',
      });
      setStatus(`Saved ${distanceKm.toFixed(2)}km to the leaderboard for ${runnerName}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>Live tracker</h2>
        <p className="muted">
          Browser Geolocation drives distance and rolling pace; samples go to the roast engine every{' '}
          {SAMPLE_INTERVAL_SEC}s and the finished run lands on the leaderboard as <code>web</code>.
        </p>

        <label>
          Roast session
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.runnerName} · target {formatPace(item.targetPaceSecPerKm)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Runner name (leaderboard)
          <input value={runnerName} onChange={(e) => setRunnerName(e.target.value)} />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
          Simulated GPS (desktop demo, no permission prompt)
        </label>
        {simulate && (
          <label>
            Simulated pace (m:ss per km)
            <input value={simulatePace} onChange={(e) => setSimulatePace(e.target.value)} />
          </label>
        )}

        <div className="row">
          {tracking ? (
            <button className="secondary" onClick={finish}>
              Finish run
            </button>
          ) : (
            <button disabled={!sessionId} onClick={start}>
              Start run
            </button>
          )}
        </div>

        {!secureContext && (
          <p className="status">
            Page is not a secure context — browsers only expose GPS over HTTPS or on localhost.
          </p>
        )}
        {status && <p className="status">{status}</p>}
        {error && <p className="error-banner">{error}</p>}
      </section>

      <section className="card">
        <h2>Live stats</h2>
        <dl className="stats">
          <div>
            <dt>Distance</dt>
            <dd>{track.distanceKm.toFixed(2)} km</dd>
          </div>
          <div>
            <dt>Pace (rolling)</dt>
            <dd>{track.paceSecPerKm > 0 ? formatPace(Math.round(track.paceSecPerKm)) : '—'}</dd>
          </div>
          <div>
            <dt>Pace (average)</dt>
            <dd>{track.avgPaceSecPerKm > 0 ? formatPace(Math.round(track.avgPaceSecPerKm)) : '—'}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{durationLabel(track.elapsedSec)}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{session ? formatPace(session.targetPaceSecPerKm) : '—'}</dd>
          </div>
        </dl>
        <p className="muted">
          {track.fixes.length} fix(es) in the pace window
          {track.rejectedFixes > 0 &&
            ` · ${track.rejectedFixes} dropped (poor accuracy, stale timestamp or impossible jump)`}
        </p>
      </section>

      <section className="card card--wide">
        <h2>Roasts this run ({roasts.length})</h2>
        {roasts.length === 0 && (
          <p className="muted">Nothing yet — roasts fire when your rolling pace drifts past the target.</p>
        )}
        {roasts.map((roast) => (
          <article key={roast.id} className="roast">
            <div className="roast__meta">
              <span className="badge">{roast.audio?.provider ?? 'no audio'}</span>
              <span className="muted">
                {roast.paceSecPerKm ? formatPace(roast.paceSecPerKm) : '—'} vs{' '}
                {formatPace(roast.targetPaceSecPerKm)}
              </span>
            </div>
            <p>{roast.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
