import type { Bet, BetProgress, BetStatus, BetTarget } from '../../shared/types.js';

export interface TargetResult {
  targetId: string;
  label: string;
  met: boolean;
  /** True while the run is live and the target is currently not being met. */
  atRisk: boolean;
  /** Positive amount the runner is short by (sec/km for pace, km for distance). */
  shortfall: number;
}

export interface BetEvaluation {
  status: BetStatus;
  targetResults: TargetResult[];
  missedTargetIds: string[];
  atRiskTargetIds: string[];
}

export function evaluateTarget(target: BetTarget, progress: BetProgress): Omit<TargetResult, 'atRisk'> {
  if (target.kind === 'avg_pace') {
    const shortfall = progress.avgPaceSecPerKm - target.value;
    return {
      targetId: target.id,
      label: target.label,
      met: shortfall <= 0,
      shortfall: Math.max(0, shortfall),
    };
  }

  const shortfall = target.value - progress.distanceKm;
  return {
    targetId: target.id,
    label: target.label,
    met: shortfall <= 0,
    shortfall: Math.max(0, shortfall),
  };
}

/**
 * Evaluates a stake against the latest progress snapshot.
 *
 * While the run is live (`final: false`) unmet targets are only flagged
 * `atRisk` — a runner can still claw back an average pace or add distance. The
 * bet is only settled to `won`/`missed` on the final snapshot, which is what
 * triggers the confession voice note.
 */
export function evaluateBet(
  bet: Pick<Bet, 'targets'>,
  progress: BetProgress,
  opts: { final: boolean },
): BetEvaluation {
  const results: TargetResult[] = bet.targets.map((target) => {
    const base = evaluateTarget(target, progress);
    return { ...base, atRisk: !opts.final && !base.met };
  });

  const unmet = results.filter((r) => !r.met);

  if (!opts.final) {
    return {
      status: 'in_progress',
      targetResults: results,
      missedTargetIds: [],
      atRiskTargetIds: unmet.map((r) => r.targetId),
    };
  }

  return {
    status: unmet.length === 0 ? 'won' : 'missed',
    targetResults: results,
    missedTargetIds: unmet.map((r) => r.targetId),
    atRiskTargetIds: [],
  };
}
