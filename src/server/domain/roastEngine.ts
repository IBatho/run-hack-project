import type { PaceSample, RunSession } from '../../shared/types.js';

export interface RoastEvaluationState {
  consecutiveSlowSamples: number;
  lastRoastAtMs: number | null;
  wasSlow: boolean;
}

export type RoastDecisionReason =
  | 'within_target'
  | 'debouncing'
  | 'cooldown'
  | 'threshold_crossed';

export interface RoastDecision {
  shouldRoast: boolean;
  reason: RoastDecisionReason;
  /** Pace threshold (sec/km) that the sample was compared against. */
  thresholdSecPerKm: number;
  /** How much slower than target the runner is, as a fraction (0.12 = 12% slower). */
  slowByPct: number;
  state: RoastEvaluationState;
}

export const initialRoastState = (): RoastEvaluationState => ({
  consecutiveSlowSamples: 0,
  lastRoastAtMs: null,
  wasSlow: false,
});

export const paceThreshold = (session: RunSession): number =>
  session.targetPaceSecPerKm * (1 + session.tolerancePct);

/**
 * Decides whether a pace sample should fire an audio roast.
 *
 * A roast fires only when the runner has been slower than the tolerated
 * threshold for `debounceSamples` consecutive samples and the per-session
 * cooldown has elapsed. Dropping back inside target resets the debounce so the
 * next slowdown is treated as a fresh threshold crossing.
 */
export function evaluatePaceSample(
  session: RunSession,
  sample: Pick<PaceSample, 'paceSecPerKm' | 'at'>,
  state: RoastEvaluationState,
): RoastDecision {
  const thresholdSecPerKm = paceThreshold(session);
  const slowByPct = sample.paceSecPerKm / session.targetPaceSecPerKm - 1;
  const isSlow = sample.paceSecPerKm > thresholdSecPerKm;

  if (!isSlow) {
    return {
      shouldRoast: false,
      reason: 'within_target',
      thresholdSecPerKm,
      slowByPct,
      state: { ...state, consecutiveSlowSamples: 0, wasSlow: false },
    };
  }

  const consecutiveSlowSamples = state.consecutiveSlowSamples + 1;

  if (consecutiveSlowSamples < session.debounceSamples) {
    return {
      shouldRoast: false,
      reason: 'debouncing',
      thresholdSecPerKm,
      slowByPct,
      state: { ...state, consecutiveSlowSamples, wasSlow: true },
    };
  }

  const cooldownMs = session.cooldownSec * 1000;
  const withinCooldown =
    state.lastRoastAtMs !== null && sample.at - state.lastRoastAtMs < cooldownMs;

  if (withinCooldown) {
    return {
      shouldRoast: false,
      reason: 'cooldown',
      thresholdSecPerKm,
      slowByPct,
      state: { ...state, consecutiveSlowSamples, wasSlow: true },
    };
  }

  return {
    shouldRoast: true,
    reason: 'threshold_crossed',
    thresholdSecPerKm,
    slowByPct,
    state: { consecutiveSlowSamples, lastRoastAtMs: sample.at, wasSlow: true },
  };
}
