import { describe, expect, it } from 'vitest';
import {
  evaluatePaceSample,
  initialRoastState,
  paceThreshold,
  type RoastEvaluationState,
} from '../src/server/domain/roastEngine.js';
import type { RunSession } from '../src/shared/types.js';

const session: RunSession = {
  id: 's1',
  runnerName: 'Isaac',
  targetPaceSecPerKm: 300,
  tolerancePct: 0.05,
  debounceSamples: 2,
  cooldownSec: 60,
  voiceId: 'voice',
  sponsorEnabled: true,
  createdAt: new Date(0).toISOString(),
};

const feed = (
  samples: Array<{ paceSecPerKm: number; at: number }>,
  overrides: Partial<RunSession> = {},
  state: RoastEvaluationState = initialRoastState(),
) => {
  const cfg = { ...session, ...overrides };
  return samples.map((sample) => {
    const decision = evaluatePaceSample(cfg, sample, state);
    state = decision.state;
    return decision;
  });
};

describe('paceThreshold', () => {
  it('applies the tolerance above target pace', () => {
    expect(paceThreshold(session)).toBe(315);
  });
});

describe('evaluatePaceSample', () => {
  it('never roasts while inside the tolerated threshold', () => {
    const decisions = feed([
      { paceSecPerKm: 290, at: 0 },
      { paceSecPerKm: 315, at: 10_000 },
    ]);
    expect(decisions.map((d) => d.reason)).toEqual(['within_target', 'within_target']);
    expect(decisions.every((d) => !d.shouldRoast)).toBe(true);
  });

  it('debounces until enough consecutive slow samples arrive', () => {
    const decisions = feed([
      { paceSecPerKm: 340, at: 0 },
      { paceSecPerKm: 345, at: 10_000 },
    ]);
    expect(decisions[0]).toMatchObject({ shouldRoast: false, reason: 'debouncing' });
    expect(decisions[1]).toMatchObject({ shouldRoast: true, reason: 'threshold_crossed' });
  });

  it('reports how far off target the runner is', () => {
    const [decision] = feed([{ paceSecPerKm: 360, at: 0 }], { debounceSamples: 1 });
    expect(decision.shouldRoast).toBe(true);
    expect(decision.slowByPct).toBeCloseTo(0.2, 5);
  });

  it('suppresses repeat roasts inside the cooldown window', () => {
    const decisions = feed(
      [
        { paceSecPerKm: 340, at: 0 },
        { paceSecPerKm: 340, at: 5_000 },
        { paceSecPerKm: 340, at: 30_000 },
        { paceSecPerKm: 340, at: 70_000 },
      ],
      { debounceSamples: 1, cooldownSec: 60 },
    );
    expect(decisions.map((d) => d.reason)).toEqual([
      'threshold_crossed',
      'cooldown',
      'cooldown',
      'threshold_crossed',
    ]);
  });

  it('resets the debounce after the runner returns inside target', () => {
    const decisions = feed(
      [
        { paceSecPerKm: 340, at: 0 },
        { paceSecPerKm: 290, at: 10_000 },
        { paceSecPerKm: 340, at: 20_000 },
        { paceSecPerKm: 340, at: 30_000 },
      ],
      { debounceSamples: 2, cooldownSec: 0 },
    );
    expect(decisions.map((d) => d.shouldRoast)).toEqual([false, false, false, true]);
  });

  it('fires immediately on the first slow sample when debounce is 1 and no prior roast', () => {
    const [decision] = feed([{ paceSecPerKm: 400, at: 1_000 }], { debounceSamples: 1 });
    expect(decision.shouldRoast).toBe(true);
    expect(decision.state.lastRoastAtMs).toBe(1_000);
  });
});
