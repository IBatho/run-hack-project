import type {
  ActivitySource,
  Bet,
  LeaderboardEntry,
  LeaderboardMetric,
  RunActivity,
} from '../../shared/types.js';

export interface LeaderboardInput {
  activities: RunActivity[];
  /** Roast counts keyed by runner name. */
  roastCounts: Map<string, number>;
  bets: Bet[];
  metric?: LeaderboardMetric;
  /** Only count activities started at or after this epoch millis. */
  sinceMs?: number;
}

const SOURCE_ORDER: ActivitySource[] = ['manual', 'strava', 'ios'];

interface Accumulator {
  runnerName: string;
  runCount: number;
  totalDistanceKm: number;
  totalDurationSec: number;
  bestPaceSecPerKm: number | null;
  sources: Set<ActivitySource>;
}

const compare = (metric: LeaderboardMetric) => (a: Accumulator & { roastCount: number }, b: Accumulator & { roastCount: number }) => {
  if (metric === 'pace') {
    const paceA = a.bestPaceSecPerKm ?? Number.POSITIVE_INFINITY;
    const paceB = b.bestPaceSecPerKm ?? Number.POSITIVE_INFINITY;
    if (paceA !== paceB) return paceA - paceB;
  } else if (metric === 'roasts') {
    if (a.roastCount !== b.roastCount) return b.roastCount - a.roastCount;
  }
  if (b.totalDistanceKm !== a.totalDistanceKm) return b.totalDistanceKm - a.totalDistanceKm;
  return a.runnerName.localeCompare(b.runnerName);
};

/**
 * Ranks runners from their completed activities, enriched with the roast and
 * bet history already tracked by the app.
 *
 * `distance` ranks by total kilometres, `pace` by the runner's single best
 * activity pace, and `roasts` by how often the Audio Roast Engine fired at
 * them. Total distance is the tie-break for every metric so the ordering is
 * stable, and runners with roasts or bets but no logged activity still appear
 * (with a null pace) rather than silently dropping out of the board.
 */
export function buildLeaderboard(input: LeaderboardInput): LeaderboardEntry[] {
  const metric = input.metric ?? 'distance';
  const accumulators = new Map<string, Accumulator>();

  const accumulatorFor = (runnerName: string): Accumulator => {
    const existing = accumulators.get(runnerName);
    if (existing) return existing;
    const created: Accumulator = {
      runnerName,
      runCount: 0,
      totalDistanceKm: 0,
      totalDurationSec: 0,
      bestPaceSecPerKm: null,
      sources: new Set<ActivitySource>(),
    };
    accumulators.set(runnerName, created);
    return created;
  };

  for (const activity of input.activities) {
    if (input.sinceMs !== undefined && Date.parse(activity.startedAt) < input.sinceMs) continue;
    const acc = accumulatorFor(activity.runnerName);
    acc.runCount += 1;
    acc.totalDistanceKm += activity.distanceKm;
    acc.totalDurationSec += activity.durationSec;
    acc.sources.add(activity.source);
    if (acc.bestPaceSecPerKm === null || activity.avgPaceSecPerKm < acc.bestPaceSecPerKm) {
      acc.bestPaceSecPerKm = activity.avgPaceSecPerKm;
    }
  }

  for (const runnerName of input.roastCounts.keys()) accumulatorFor(runnerName);
  for (const bet of input.bets) accumulatorFor(bet.runner);

  const rows = [...accumulators.values()].map((acc) => ({
    ...acc,
    roastCount: input.roastCounts.get(acc.runnerName) ?? 0,
  }));

  return rows.sort(compare(metric)).map((row, index) => ({
    rank: index + 1,
    runnerName: row.runnerName,
    runCount: row.runCount,
    totalDistanceKm: Math.round(row.totalDistanceKm * 100) / 100,
    avgPaceSecPerKm:
      row.totalDistanceKm > 0 ? Math.round(row.totalDurationSec / row.totalDistanceKm) : null,
    bestPaceSecPerKm: row.bestPaceSecPerKm === null ? null : Math.round(row.bestPaceSecPerKm),
    roastCount: row.roastCount,
    betsWon: input.bets.filter((bet) => bet.runner === row.runnerName && bet.status === 'won').length,
    betsMissed: input.bets.filter((bet) => bet.runner === row.runnerName && bet.status === 'missed')
      .length,
    sources: SOURCE_ORDER.filter((source) => row.sources.has(source)),
  }));
}
