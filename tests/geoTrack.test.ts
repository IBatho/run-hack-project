import { describe, expect, it } from 'vitest';
import {
  applyFix,
  DEFAULT_TRACK_OPTIONS,
  haversineMetres,
  initialTrackState,
  shouldSendSample,
  simulatedFix,
  type Fix,
} from '../src/web/tracking/geoTrack.js';

const START_MS = Date.UTC(2024, 0, 1, 8, 0, 0);
const ORIGIN = { latitude: 51.5074, longitude: -0.1278 };

const fixAt = (index: number, paceSecPerKm = 300, stepSec = 5): Fix =>
  simulatedFix(ORIGIN, index, paceSecPerKm, stepSec, START_MS);

const runFixes = (count: number, paceSecPerKm = 300, stepSec = 5) => {
  let state = initialTrackState();
  for (let index = 0; index <= count; index += 1) {
    state = applyFix(state, fixAt(index, paceSecPerKm, stepSec));
  }
  return state;
};

describe('haversineMetres', () => {
  it('measures a known north-south offset', () => {
    const a: Fix = { ...ORIGIN, accuracyM: 5, timestamp: START_MS };
    const b: Fix = { ...ORIGIN, latitude: ORIGIN.latitude + 0.01, accuracyM: 5, timestamp: START_MS };
    expect(haversineMetres(a, b)).toBeCloseTo(1112, 0);
  });

  it('is zero for the same point', () => {
    const a: Fix = { ...ORIGIN, accuracyM: 5, timestamp: START_MS };
    expect(haversineMetres(a, a)).toBe(0);
  });
});

describe('applyFix', () => {
  it('accumulates distance and derives pace from the rolling window', () => {
    const state = runFixes(12, 300, 5);
    // 12 steps x 5s at 5:00/km => 60s of running => 0.2km.
    expect(state.distanceKm).toBeCloseTo(0.2, 2);
    expect(state.paceSecPerKm).toBeGreaterThan(280);
    expect(state.paceSecPerKm).toBeLessThan(320);
    expect(state.elapsedSec).toBe(60);
  });

  it('tracks a pace change without letting old fixes drag it', () => {
    const fast = runFixes(24, 240, 5).paceSecPerKm;
    const slow = runFixes(24, 420, 5).paceSecPerKm;
    expect(fast).toBeLessThan(slow);
    expect(slow).toBeGreaterThan(380);
  });

  it('drops inaccurate fixes instead of inventing distance', () => {
    const clean = applyFix(initialTrackState(), fixAt(0));
    const noisy = applyFix(clean, { ...fixAt(1), accuracyM: 500 });
    expect(noisy.rejectedFixes).toBe(1);
    expect(noisy.distanceKm).toBe(clean.distanceKm);
    expect(noisy.lastFix).toBe(clean.lastFix);
  });

  it('ignores sub-threshold jitter while standing still', () => {
    const first = applyFix(initialTrackState(), fixAt(0));
    const jittered = applyFix(first, {
      ...ORIGIN,
      latitude: ORIGIN.latitude + 0.000005, // ~0.5m
      accuracyM: 8,
      timestamp: START_MS + 5000,
    });
    expect(jittered.distanceKm).toBe(0);
  });

  it('never mutates the state it is given', () => {
    const state = initialTrackState();
    applyFix(state, fixAt(1));
    expect(state).toEqual(initialTrackState());
  });

  it('prunes fixes outside the pace window', () => {
    const state = runFixes(30, 300, 5);
    const span = (state.lastFix!.timestamp - state.fixes[0].timestamp) / 1000;
    expect(span).toBeLessThanOrEqual(DEFAULT_TRACK_OPTIONS.paceWindowSec);
  });
});

describe('shouldSendSample', () => {
  it('always sends the first sample and then throttles', () => {
    expect(shouldSendSample(START_MS, null, 15)).toBe(true);
    expect(shouldSendSample(START_MS + 14_000, START_MS, 15)).toBe(false);
    expect(shouldSendSample(START_MS + 15_000, START_MS, 15)).toBe(true);
  });
});
