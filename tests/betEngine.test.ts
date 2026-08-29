import { describe, expect, it } from 'vitest';
import { evaluateBet, evaluateTarget } from '../src/server/domain/betEngine.js';
import type { BetProgress, BetTarget } from '../src/shared/types.js';

const paceTarget: BetTarget = { id: 't-pace', label: 'Sub 5:10/km', kind: 'avg_pace', value: 310 };
const distanceTarget: BetTarget = { id: 't-dist', label: '10km', kind: 'distance', value: 10 };
const progress = (distanceKm: number, avgPaceSecPerKm: number): BetProgress => ({
  distanceKm,
  avgPaceSecPerKm,
  elapsedSec: Math.round(distanceKm * avgPaceSecPerKm),
  at: 1_000,
});

describe('evaluateTarget', () => {
  it('meets a pace target when the average is at or under the limit', () => {
    expect(evaluateTarget(paceTarget, progress(10, 310))).toMatchObject({ met: true, shortfall: 0 });
    expect(evaluateTarget(paceTarget, progress(10, 338))).toMatchObject({ met: false, shortfall: 28 });
  });

  it('meets a distance target when the runner covers at least the distance', () => {
    expect(evaluateTarget(distanceTarget, progress(10.2, 300))).toMatchObject({ met: true, shortfall: 0 });
    expect(evaluateTarget(distanceTarget, progress(8.5, 300)).shortfall).toBeCloseTo(1.5, 5);
  });
});

describe('evaluateBet', () => {
  const bet = { targets: [paceTarget, distanceTarget] };

  it('flags unmet targets as at risk mid-run without settling', () => {
    const result = evaluateBet(bet, progress(6, 340), { final: false });
    expect(result.status).toBe('in_progress');
    expect(result.missedTargetIds).toEqual([]);
    expect(result.atRiskTargetIds).toEqual(['t-pace', 't-dist']);
  });

  it('settles as won when every target is met on the final snapshot', () => {
    const result = evaluateBet(bet, progress(10.1, 298), { final: true });
    expect(result.status).toBe('won');
    expect(result.missedTargetIds).toEqual([]);
  });

  it('settles as missed and lists only the unmet targets', () => {
    const result = evaluateBet(bet, progress(10.4, 341), { final: true });
    expect(result.status).toBe('missed');
    expect(result.missedTargetIds).toEqual(['t-pace']);
    expect(result.targetResults.find((r) => r.targetId === 't-pace')?.shortfall).toBe(31);
  });

  it('does not mark targets at risk once final', () => {
    const result = evaluateBet(bet, progress(9, 340), { final: true });
    expect(result.atRiskTargetIds).toEqual([]);
    expect(result.targetResults.every((r) => !r.atRisk)).toBe(true);
  });
});
