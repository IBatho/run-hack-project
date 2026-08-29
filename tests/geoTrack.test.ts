import { describe, expect, it } from 'vitest';
import {
  applyFix,
  DEFAULT_TRACK_OPTIONS,
  haversineMetres,
  initialTrackState,
  paceFromDistance,
  paceFromSpeedMps,
  shouldSendSample,
  simulatedFix,
  type Fix,
  type TrackState,
} from '../src/web/tracking/geoTrack.js';

const START_MS = Date.UTC(2024, 0, 1, 8, 0, 0);
const ORIGIN = { latitude: 51.5074, longitude: -0.1278 };
const METRES_PER_DEGREE_LAT = 111_194.93;

/** A fix `metresNorth` from the origin at `atSec` into the run. */
const northOf = (metresNorth: number, atSec: number, accuracyM = 8): Fix => ({
  latitude: ORIGIN.latitude + metresNorth / METRES_PER_DEGREE_LAT,
  longitude: ORIGIN.longitude,
  accuracyM,
  timestamp: START_MS + atSec * 1000,
});

const fixAt = (index: number, paceSecPerKm = 300, stepSec = 5): Fix =>
  simulatedFix(ORIGIN, index, paceSecPerKm, stepSec, START_MS);

const runFixes = (count: number, paceSecPerKm = 300, stepSec = 5): TrackState => {
  let state = initialTrackState();
  for (let index = 0; index <= count; index += 1) {
    state = applyFix(state, fixAt(index, paceSecPerKm, stepSec));
  }
  return state;
};

/** Runs at a constant speed, one fix every `stepSec`, for `durationSec`. */
const runAtSpeed = (speedMps: number, durationSec: number, stepSec: number): TrackState => {
  let state = initialTrackState();
  for (let atSec = 0; atSec <= durationSec; atSec += stepSec) {
    state = applyFix(state, northOf(speedMps * atSec, atSec));
  }
  return state;
};

describe('unit conversions', () => {
  it('converts speed in m/s to seconds per km', () => {
    expect(paceFromSpeedMps(1000 / 300)).toBeCloseTo(300, 6); // 3.33 m/s => 5:00/km
    expect(paceFromSpeedMps(4)).toBeCloseTo(250, 6);
  });

  it('treats a stopped or invalid speed as unknown pace', () => {
    expect(paceFromSpeedMps(0)).toBe(0);
    expect(paceFromSpeedMps(-3)).toBe(0);
    expect(paceFromSpeedMps(Number.NaN)).toBe(0);
  });

  it('derives pace from kilometres and seconds, guarding zero deltas', () => {
    expect(paceFromDistance(2, 600)).toBe(300);
    expect(paceFromDistance(0, 600)).toBe(0);
    expect(paceFromDistance(2, 0)).toBe(0);
  });
});

describe('haversineMetres', () => {
  it('measures a known north-south offset', () => {
    const a: Fix = { ...ORIGIN, accuracyM: 5, timestamp: START_MS };
    const b: Fix = { ...ORIGIN, latitude: ORIGIN.latitude + 0.01, accuracyM: 5, timestamp: START_MS };
    expect(haversineMetres(a, b)).toBeCloseTo(1112, 0);
  });

  it('measures an east-west offset shortened by the latitude', () => {
    const a: Fix = { ...ORIGIN, accuracyM: 5, timestamp: START_MS };
    const b: Fix = { ...ORIGIN, longitude: ORIGIN.longitude + 0.01, accuracyM: 5, timestamp: START_MS };
    // 0.01deg of longitude at 51.5N ≈ 1112m * cos(51.5) ≈ 692m.
    expect(haversineMetres(a, b)).toBeCloseTo(692, 0);
  });

  it('is zero for the same point', () => {
    const a: Fix = { ...ORIGIN, accuracyM: 5, timestamp: START_MS };
    expect(haversineMetres(a, a)).toBe(0);
  });
});

describe('applyFix pace accuracy', () => {
  it('reports the true pace of a realistic 5:00/km run', () => {
    const state = runFixes(12, 300, 5);
    // 12 steps x 5s at 5:00/km => 60s of running => 0.2km.
    expect(state.distanceKm).toBeCloseTo(0.2, 3);
    expect(state.paceSecPerKm).toBeCloseTo(300, 0);
    expect(state.avgPaceSecPerKm).toBeCloseTo(300, 0);
    expect(state.elapsedSec).toBe(60);
  });

  it('keeps pace stable rather than oscillating as the window prunes', () => {
    let state = initialTrackState();
    const paces: number[] = [];
    for (let index = 0; index <= 40; index += 1) {
      state = applyFix(state, fixAt(index, 330, 5));
      if (index >= 12) paces.push(state.paceSecPerKm);
    }
    for (const pace of paces) expect(pace).toBeCloseTo(330, 0);
  });

  it('does not lose distance when steps are smaller than the jitter floor', () => {
    // 1.5 m/s sampled every second: every individual step is below minStepM,
    // but the run still covers 90m in a minute.
    const state = runAtSpeed(1.5, 60, 1);
    expect(state.distanceKm).toBeCloseTo(0.09, 3);
    // Crediting distance only once a step clears the floor quantises the window
    // slightly, so allow 3% around the true 11:07/km.
    const truePace = paceFromSpeedMps(1.5);
    expect(state.paceSecPerKm).toBeGreaterThan(truePace * 0.97);
    expect(state.paceSecPerKm).toBeLessThan(truePace * 1.03);
  });

  it('tracks a pace change without letting old fixes drag it', () => {
    const fast = runFixes(24, 240, 5).paceSecPerKm;
    const slow = runFixes(24, 420, 5).paceSecPerKm;
    expect(fast).toBeCloseTo(240, 0);
    expect(slow).toBeCloseTo(420, 0);
  });

  it('falls back to unknown pace after a full window standing still', () => {
    let state = runAtSpeed(3, 60, 5);
    expect(state.paceSecPerKm).toBeCloseTo(paceFromSpeedMps(3), 0);
    const stoppedAtM = 3 * 60;
    for (let atSec = 65; atSec <= 65 + DEFAULT_TRACK_OPTIONS.paceWindowSec + 5; atSec += 5) {
      state = applyFix(state, northOf(stoppedAtM, atSec));
    }
    expect(state.paceSecPerKm).toBe(0);
    expect(state.distanceKm).toBeCloseTo(0.18, 2);
  });

  it('reports whole-run average pace independently of the rolling window', () => {
    const state = runAtSpeed(4, 60, 5); // 4 m/s => 250s/km
    // A slow final 10s drags the average up but not to the rolling value.
    const slower = applyFix(state, northOf(4 * 60 + 10, 70));
    expect(slower.avgPaceSecPerKm).toBeCloseTo(paceFromDistance(slower.distanceKm, 70), 6);
    expect(slower.avgPaceSecPerKm).toBeGreaterThan(250);
    expect(slower.paceSecPerKm).toBeGreaterThan(slower.avgPaceSecPerKm);
  });
});

describe('applyFix filtering', () => {
  it('drops inaccurate fixes instead of inventing distance', () => {
    const clean = applyFix(initialTrackState(), fixAt(0));
    const noisy = applyFix(clean, { ...fixAt(1), accuracyM: 500 });
    expect(noisy.rejectedFixes).toBe(1);
    expect(noisy.distanceKm).toBe(clean.distanceKm);
    expect(noisy.lastFix).toBe(clean.lastFix);
  });

  it('drops fixes with non-finite or out-of-range coordinates', () => {
    const clean = applyFix(initialTrackState(), fixAt(0));
    for (const broken of [
      { ...fixAt(1), latitude: Number.NaN },
      { ...fixAt(1), longitude: Number.POSITIVE_INFINITY },
      { ...fixAt(1), accuracyM: Number.NaN },
      { ...fixAt(1), accuracyM: -1 },
      { ...fixAt(1), latitude: 91 },
      { ...fixAt(1), timestamp: Number.NaN },
    ]) {
      const next = applyFix(clean, broken);
      expect(next.rejectedFixes).toBe(1);
      expect(next.distanceKm).toBe(clean.distanceKm);
      expect(next.paceSecPerKm).toBe(clean.paceSecPerKm);
    }
  });

  it('drops duplicate and out-of-order timestamps', () => {
    const first = applyFix(initialTrackState(), northOf(0, 0));
    const second = applyFix(first, northOf(20, 5));
    const duplicate = applyFix(second, northOf(40, 5));
    const rewound = applyFix(second, northOf(40, 3));
    expect(duplicate.rejectedFixes).toBe(1);
    expect(duplicate.distanceKm).toBe(second.distanceKm);
    expect(rewound.rejectedFixes).toBe(1);
    expect(rewound.elapsedSec).toBe(second.elapsedSec);
  });

  it('rejects a GPS teleport that implies an impossible speed', () => {
    const first = applyFix(initialTrackState(), northOf(0, 0));
    const jumped = applyFix(first, northOf(800, 5)); // 160 m/s
    expect(jumped.rejectedFixes).toBe(1);
    expect(jumped.distanceKm).toBe(0);
    // The same jump is plausible when it happens over a long gap.
    const throttled = applyFix(first, northOf(800, 120));
    expect(throttled.distanceKm).toBeCloseTo(0.8, 2);
  });

  it('ignores sub-threshold jitter while standing still', () => {
    const first = applyFix(initialTrackState(), fixAt(0));
    let state = first;
    for (let atSec = 5; atSec <= 30; atSec += 5) {
      // ±0.5m of noise around the same spot.
      state = applyFix(state, northOf(atSec % 10 === 0 ? 0.5 : -0.5, atSec));
    }
    expect(state.distanceKm).toBe(0);
  });

  it('never mutates the state it is given', () => {
    const state = initialTrackState();
    applyFix(state, fixAt(1));
    expect(state).toEqual(initialTrackState());
  });

  it('keeps a window at least as long as paceWindowSec once there is history', () => {
    const state = runFixes(30, 300, 5);
    const span = (state.fixes[state.fixes.length - 1].timestamp - state.fixes[0].timestamp) / 1000;
    expect(span).toBeGreaterThanOrEqual(DEFAULT_TRACK_OPTIONS.paceWindowSec);
    expect(span).toBeLessThanOrEqual(DEFAULT_TRACK_OPTIONS.paceWindowSec + 5);
  });
});

describe('shouldSendSample', () => {
  it('always sends the first sample and then throttles', () => {
    expect(shouldSendSample(START_MS, null, 15)).toBe(true);
    expect(shouldSendSample(START_MS + 14_000, START_MS, 15)).toBe(false);
    expect(shouldSendSample(START_MS + 15_000, START_MS, 15)).toBe(true);
  });
});

describe('simulatedFix', () => {
  it('produces fixes whose measured pace matches the requested pace', () => {
    const state = runFixes(20, 360, 5);
    expect(state.paceSecPerKm).toBeCloseTo(360, 0);
  });
});
