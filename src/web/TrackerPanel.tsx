import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPace, parsePace } from '../shared/pace.js';
import type { Roast, RunCommand } from '../shared/types.js';
import { api, clipUrl, type SessionWithThreshold } from './api.js';
import { AudioCues, shouldSpeakLocally } from './tracking/audioCues.js';
import { bindMediaSession, requestWakeLock, type WakeLockHandle } from './tracking/backgroundSession.js';
import { RoastAudioSession, type RoastAudioSnapshot } from './tracking/roastAudio.js';
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
/** Roasts fired server-side (pace thresholds, Poke "roast me") are picked up here. */
const ROAST_POLL_MS = 5_000;
/** How often the app looks for a run Poke started for this runner. */
const COMMAND_POLL_MS = 6_000;

const durationLabel = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Mock clips are formant gibberish, so they queue as text for the speech synthesiser. */
const toQueued = (roast: Roast) => ({
  id: roast.id,
  text: roast.text,
  clipUrl: roast.audio && !shouldSpeakLocally(roast.audio) ? clipUrl(roast.audio.url) : null,
  at: Date.parse(roast.createdAt),
});

const audioLabel = (snapshot: RoastAudioSnapshot): string => {
  switch (snapshot.state) {
    case 'unsupported':
      return 'no web audio in this browser';
    case 'blocked':
      return 'blocked — tap to allow audio';
    case 'idle':
      return 'not armed yet';
    case 'playing':
      return 'playing in your headphones';
    default:
      return 'armed and listening';
  }
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
  const [command, setCommand] = useState<RunCommand | null>(null);

  const cues = useMemo(() => new AudioCues(), []);
  const audio = useMemo(() => new RoastAudioSession(cues), [cues]);
  const [audioState, setAudioState] = useState<RoastAudioSnapshot>(() => audio.snapshot());

  const trackRef = useRef<TrackState>(initialTrackState());
  const lastSentRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationRef = useRef<{ timer: number; index: number; startMs: number } | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const commandRef = useRef<RunCommand | null>(null);
  const runStartedAtRef = useRef<number>(0);

  const geolocationSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const secureContext = typeof window === 'undefined' || window.isSecureContext;

  useEffect(() => audio.subscribe(setAudioState), [audio]);

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

  const takeRoast = useCallback(
    (roast: Roast) => {
      setRoasts((current) => (current.some((item) => item.id === roast.id) ? current : [roast, ...current]));
      audio.enqueue(toQueued(roast));
    },
    [audio],
  );

  const pushSample = useCallback(
    async (state: TrackState) => {
      if (!sessionId || state.paceSecPerKm <= 0 || state.distanceKm <= 0) return;
      try {
        const { roast } = await api.addSample(sessionId, {
          paceSecPerKm: Math.round(state.paceSecPerKm),
          distanceKm: Number(state.distanceKm.toFixed(3)),
        });
        if (!roast) return;
        audio.cue('slow');
        takeRoast(roast);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [audio, sessionId, takeRoast],
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
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  useEffect(() => stopSources, [stopSources]);

  // Roasts can be fired by the server (pace thresholds, Poke "roast me") while
  // this tab is backgrounded, so the queue is fed by polling rather than only by
  // the reply to our own sample POST.
  useEffect(() => {
    if (!tracking || !sessionId) return;
    const timer = window.setInterval(() => {
      api
        .getSession(sessionId)
        .then(({ roasts: list }) =>
          list
            .filter((roast) => Date.parse(roast.createdAt) >= runStartedAtRef.current)
            .reverse()
            .forEach(takeRoast),
        )
        .catch(() => undefined);
    }, ROAST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tracking, sessionId, takeRoast]);

  // A suspended AudioContext (screen lock, tab switch) can only be resumed once
  // the page is interactive again; re-arming on visibility/focus is free.
  useEffect(() => {
    if (!tracking) return;
    const rearm = () => {
      if (document.visibilityState !== 'visible') return;
      void audio.arm();
      void wakeLockRef.current?.reacquire();
    };
    document.addEventListener('visibilitychange', rearm);
    window.addEventListener('focus', rearm);
    return () => {
      document.removeEventListener('visibilitychange', rearm);
      window.removeEventListener('focus', rearm);
    };
  }, [tracking, audio]);

  useEffect(() => {
    if (!tracking) return;
    return bindMediaSession({
      title: `Coaching ${runnerName}`,
      onSkip: () => audio.skip(),
      onPause: () => audio.setMuted(true),
      onResume: () => {
        audio.setMuted(false);
        void audio.arm();
      },
    });
  }, [tracking, runnerName, audio]);

  const startTracking = useCallback(
    (fromCommand: RunCommand | null) => {
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
        setStatus(
          `${fromCommand ? 'Poke started this run. ' : ''}Simulating a ${simulatePace}/km run — no GPS permission needed.`,
        );
        return true;
      }

      if (!geolocationSupported) {
        setError('This browser has no Geolocation API. Use simulated GPS instead.');
        return false;
      }
      if (!secureContext) {
        setError('Geolocation needs HTTPS (or localhost). Open the page over https or use simulated GPS.');
        return false;
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
      setStatus(
        `${fromCommand ? 'Poke started this run. ' : ''}Tracking with the screen lock held where the browser allows it.`,
      );
      return true;
    },
    [geolocationSupported, ingest, secureContext, simulate, simulatePace],
  );

  /**
   * The one place audio is unlocked. Runs inside the click handler because
   * browsers only start audio from a user gesture — which is also why a Poke
   * command cannot start the sound on its own and waits here to be claimed.
   */
  const start = async (pending: RunCommand | null = commandRef.current) => {
    setError(null);
    setRoasts([]);
    trackRef.current = initialTrackState();
    setTrack(trackRef.current);
    lastSentRef.current = null;
    runStartedAtRef.current = Date.now();

    const armed = await audio.arm();
    audio.cue('start');

    if (pending) {
      try {
        const { command: claimed } = await api.claimCommand(pending.id, armed);
        setCommand(claimed);
        commandRef.current = claimed.status === 'armed' ? claimed : null;
        if (claimed.sessionId && sessions.some((item) => item.id === claimed.sessionId)) {
          setSessionId(claimed.sessionId);
        }
        setRunnerName(claimed.runnerName);
      } catch (err) {
        setError((err as Error).message);
      }
    }

    if (!startTracking(pending)) return;
    wakeLockRef.current = await requestWakeLock();
  };

  const finish = async () => {
    stopSources();
    setTracking(false);
    audio.cue('finish');
    audio.stop();

    const active = commandRef.current ?? command;
    if (active) {
      await api.completeCommand(active.id).catch(() => undefined);
      commandRef.current = null;
      setCommand(null);
    }

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

  // Poke can arm a run from chat, but not the audio: the command sits here until
  // the runner taps, which is the only thing that can unlock browser playback.
  useEffect(() => {
    if (tracking) return;
    const requested = new URLSearchParams(window.location.search).get('command');
    const poll = () => {
      api
        .pendingCommands(runnerName)
        .then(({ pending }) => {
          const next = pending.find((item) => item.id === requested) ?? pending[0] ?? null;
          commandRef.current = next;
          setCommand(next);
        })
        .catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, COMMAND_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tracking, runnerName, reloadKey]);

  const pendingStart = !tracking && command?.intent === 'start_run';

  return (
    <div className="grid">
      <section className="card">
        <h2>Live tracker</h2>
        <p className="muted">
          Browser Geolocation drives distance and rolling pace; samples go to the roast engine every{' '}
          {SAMPLE_INTERVAL_SEC}s and the finished run lands on the leaderboard as <code>web</code>.
        </p>

        {pendingStart && command && (
          <p className="status">
            Poke armed a run for {command.runnerName} at target {formatPace(command.targetPaceSecPerKm)} (
            {command.coachMode} coach). Tap <strong>Start run</strong> — browsers only allow audio after a tap.
          </p>
        )}

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
            <button disabled={!sessionId} onClick={() => void start()}>
              {pendingStart ? 'Start run (Poke)' : 'Start run'}
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
        <h2>Coach audio</h2>
        <p className="muted">
          Roasts play one at a time through whatever is connected — headphones included. Status:{' '}
          <strong>{audioLabel(audioState)}</strong>
          {audioState.queued > 0 && ` · ${audioState.queued} waiting`}
        </p>
        {audioState.playing && <p className="status">Now playing: “{audioState.playing.text}”</p>}

        <div className="row">
          <button
            className="secondary"
            disabled={audioState.state === 'unsupported'}
            onClick={() => void audio.arm()}
          >
            {audioState.state === 'armed' || audioState.state === 'playing' ? 'Re-arm audio' : 'Allow audio'}
          </button>
          <button className="secondary" onClick={() => audio.setMuted(!audioState.muted)}>
            {audioState.muted ? 'Unmute coach' : 'Mute coach'}
          </button>
          <button className="secondary" disabled={!audioState.playing} onClick={() => audio.skip()}>
            Skip roast
          </button>
        </div>

        <label>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioState.volume}
            onChange={(e) => audio.setVolume(Number(e.target.value))}
          />
        </label>

        <p className="muted">
          {audioState.played} played · {audioState.spoken} read by the browser voice · {audioState.dropped}{' '}
          dropped
        </p>
        {audioState.lastError && <p className="status">{audioState.lastError}</p>}
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
