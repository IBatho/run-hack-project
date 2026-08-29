/**
 * Pure geolocation → distance/pace maths, kept free of browser APIs so it can be
 * unit tested and reused by any front end.
 *
 * `GeolocationPosition.coords.speed` is null on most desktop browsers and jittery
 * on phones, so pace is derived from a rolling distance/time window instead.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres of horizontal accuracy; fixes worse than `maxAccuracyM` are dropped. */
  accuracyM: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface TrackState {
  fixes: Array<{ timestamp: number; distanceKm: number }>;
  lastFix: Fix | null;
  distanceKm: number;
  /** Rolling-window pace; 0 until enough movement has accumulated. */
  paceSecPerKm: number;
  startedAt: number | null;
  elapsedSec: number;
  /** Fixes rejected for poor accuracy, surfaced in the UI as a GPS-quality hint. */
  rejectedFixes: number;
}

export interface TrackOptions {
  /** Discard fixes with worse accuracy than this (metres). */
  maxAccuracyM: number;
  /** Length of the rolling pace window (seconds). */
  paceWindowSec: number;
  /** Ignore sub-metre jitter while standing still (metres). */
  minStepM: number;
}

export const DEFAULT_TRACK_OPTIONS: TrackOptions = {
  maxAccuracyM: 50,
  paceWindowSec: 45,
  minStepM: 2,
};

export const initialTrackState = (): TrackState => ({
  fixes: [],
  lastFix: null,
  distanceKm: 0,
  paceSecPerKm: 0,
  startedAt: null,
  elapsedSec: 0,
  rejectedFixes: 0,
});

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMetres(a: Fix, b: Fix): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Folds a new fix into the track. Returns a new state; never mutates `state`,
 * so it can drive React state directly.
 */
export function applyFix(
  state: TrackState,
  fix: Fix,
  options: TrackOptions = DEFAULT_TRACK_OPTIONS,
): TrackState {
  if (fix.accuracyM < 0 || fix.accuracyM > options.maxAccuracyM) {
    return { ...state, rejectedFixes: state.rejectedFixes + 1 };
  }

  const startedAt = state.startedAt ?? fix.timestamp;
  let distanceKm = state.distanceKm;

  if (state.lastFix) {
    const stepM = haversineMetres(state.lastFix, fix);
    if (stepM >= options.minStepM) distanceKm += stepM / 1000;
  }

  const windowStart = fix.timestamp - options.paceWindowSec * 1000;
  const fixes = [...state.fixes, { timestamp: fix.timestamp, distanceKm }].filter(
    (entry, index, all) => entry.timestamp >= windowStart || index === all.length - 1,
  );

  const oldest = fixes[0];
  const movedKm = distanceKm - oldest.distanceKm;
  const windowSec = (fix.timestamp - oldest.timestamp) / 1000;
  const paceSecPerKm = movedKm > 0 && windowSec > 0 ? windowSec / movedKm : state.paceSecPerKm;

  return {
    fixes,
    lastFix: fix,
    distanceKm,
    paceSecPerKm,
    startedAt,
    elapsedSec: (fix.timestamp - startedAt) / 1000,
    rejectedFixes: state.rejectedFixes,
  };
}

/** True when `intervalSec` has passed since the last upload. */
export const shouldSendSample = (
  nowMs: number,
  lastSentMs: number | null,
  intervalSec: number,
): boolean => lastSentMs === null || nowMs - lastSentMs >= intervalSec * 1000;

/**
 * Synthetic fixes for demoing/testing without leaving the desk: walks north from
 * `origin` at the given pace, one fix per `stepSec`.
 */
export function simulatedFix(
  origin: { latitude: number; longitude: number },
  index: number,
  paceSecPerKm: number,
  stepSec: number,
  startMs: number,
): Fix {
  const metresPerStep = (stepSec / paceSecPerKm) * 1000;
  const metresNorth = metresPerStep * index;
  return {
    latitude: origin.latitude + (metresNorth / EARTH_RADIUS_M) * (180 / Math.PI),
    longitude: origin.longitude,
    accuracyM: 8,
    timestamp: startMs + index * stepSec * 1000,
  };
}
