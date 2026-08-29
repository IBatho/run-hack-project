/**
 * Pure geolocation → distance/pace maths, kept free of browser APIs so it can be
 * unit tested and reused by any front end.
 *
 * `GeolocationPosition.coords.speed` is null on most desktop browsers and jittery
 * on phones, so pace is derived from a rolling distance/time window instead.
 *
 * Units: latitude/longitude in degrees, accuracy and steps in metres, timestamps
 * in epoch milliseconds, distance in kilometres, pace in seconds per kilometre.
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
  /**
   * Last fix used as the distance anchor. A fix that lands within `minStepM` of
   * the anchor does not replace it, so slow movement accumulates instead of
   * being filtered away one sub-threshold step at a time.
   */
  lastFix: Fix | null;
  distanceKm: number;
  /** Rolling-window pace; 0 when unknown (no movement yet, or stopped). */
  paceSecPerKm: number;
  /** Whole-run average pace: elapsed / distance. 0 until both are non-zero. */
  avgPaceSecPerKm: number;
  startedAt: number | null;
  elapsedSec: number;
  /** Fixes rejected as invalid, inaccurate, stale or implausible. */
  rejectedFixes: number;
}

export interface TrackOptions {
  /** Discard fixes with worse accuracy than this (metres). */
  maxAccuracyM: number;
  /** Length of the rolling pace window (seconds). */
  paceWindowSec: number;
  /** Ignore sub-metre jitter while standing still (metres). */
  minStepM: number;
  /** Discard fixes implying a speed above this (m/s); 12 m/s ≈ 1:23/km. */
  maxSpeedMps: number;
}

export const DEFAULT_TRACK_OPTIONS: TrackOptions = {
  maxAccuracyM: 50,
  paceWindowSec: 45,
  minStepM: 2,
  maxSpeedMps: 12,
};

export const initialTrackState = (): TrackState => ({
  fixes: [],
  lastFix: null,
  distanceKm: 0,
  paceSecPerKm: 0,
  avgPaceSecPerKm: 0,
  startedAt: null,
  elapsedSec: 0,
  rejectedFixes: 0,
});

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Seconds per kilometre from metres per second; 0 when stopped. */
export const paceFromSpeedMps = (metresPerSecond: number): number =>
  Number.isFinite(metresPerSecond) && metresPerSecond > 0 ? 1000 / metresPerSecond : 0;

/** Seconds per kilometre from a distance in kilometres over a duration in seconds. */
export const paceFromDistance = (distanceKm: number, durationSec: number): number =>
  distanceKm > 0 && durationSec > 0 ? durationSec / distanceKm : 0;

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

const usable = (fix: Fix, maxAccuracyM: number): boolean =>
  Number.isFinite(fix.latitude) &&
  Number.isFinite(fix.longitude) &&
  Number.isFinite(fix.timestamp) &&
  Number.isFinite(fix.accuracyM) &&
  Math.abs(fix.latitude) <= 90 &&
  Math.abs(fix.longitude) <= 180 &&
  fix.accuracyM >= 0 &&
  fix.accuracyM <= maxAccuracyM;

/**
 * Folds a new fix into the track. Returns a new state; never mutates `state`,
 * so it can drive React state directly.
 */
export function applyFix(
  state: TrackState,
  fix: Fix,
  options: TrackOptions = DEFAULT_TRACK_OPTIONS,
): TrackState {
  const reject = (): TrackState => ({ ...state, rejectedFixes: state.rejectedFixes + 1 });

  if (!usable(fix, options.maxAccuracyM)) return reject();
  // Duplicate or out-of-order fixes would divide by a zero or negative delta.
  if (state.lastFix && fix.timestamp <= state.lastFix.timestamp) return reject();
  const previous = state.fixes[state.fixes.length - 1];
  if (previous && fix.timestamp <= previous.timestamp) return reject();

  const startedAt = state.startedAt ?? fix.timestamp;
  let distanceKm = state.distanceKm;
  let anchor = state.lastFix;

  if (anchor) {
    const stepM = haversineMetres(anchor, fix);
    const stepSec = (fix.timestamp - anchor.timestamp) / 1000;
    // A GPS re-lock can teleport hundreds of metres; that is not a run.
    if (stepSec > 0 && stepM / stepSec > options.maxSpeedMps) return reject();
    if (stepM >= options.minStepM) {
      distanceKm += stepM / 1000;
      anchor = fix;
    }
  } else {
    anchor = fix;
  }

  const entries = [...state.fixes, { timestamp: fix.timestamp, distanceKm }];
  // Keep the newest entry at or before the window start so the window always
  // spans at least paceWindowSec once there is enough history.
  const windowStart = fix.timestamp - options.paceWindowSec * 1000;
  let firstInWindow = 0;
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].timestamp <= windowStart) firstInWindow = index;
  }
  const fixes = entries.slice(firstInWindow);

  const oldest = fixes[0];
  const windowSec = (fix.timestamp - oldest.timestamp) / 1000;
  const movedKm = distanceKm - oldest.distanceKm;
  let paceSecPerKm = state.paceSecPerKm;
  if (windowSec > 0 && movedKm > 0) {
    paceSecPerKm = windowSec / movedKm;
  } else if (windowSec >= options.paceWindowSec) {
    // A full window without movement means stopped, not "still at the old pace".
    paceSecPerKm = 0;
  }

  const elapsedSec = (fix.timestamp - startedAt) / 1000;

  return {
    fixes,
    lastFix: anchor,
    distanceKm,
    paceSecPerKm,
    avgPaceSecPerKm: paceFromDistance(distanceKm, elapsedSec),
    startedAt,
    elapsedSec,
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
