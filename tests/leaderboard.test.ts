import { describe, expect, it } from 'vitest';
import { buildLeaderboard } from '../src/server/domain/leaderboard.js';
import type { Bet, RunActivity } from '../src/shared/types.js';

const activity = (partial: Partial<RunActivity> & Pick<RunActivity, 'runnerName'>): RunActivity => ({
  id: `${partial.runnerName}-${partial.startedAt ?? '0'}`,
  externalId: null,
  source: 'manual',
  sessionId: null,
  name: 'Run',
  distanceKm: 10,
  durationSec: 3000,
  avgPaceSecPerKm: 300,
  startedAt: '2026-08-20T06:00:00.000Z',
  ...partial,
});

const bet = (runner: string, status: Bet['status']): Bet =>
  ({ runner, status, targets: [] }) as unknown as Bet;

const activities: RunActivity[] = [
  activity({ runnerName: 'Isaac', distanceKm: 10, durationSec: 3000, avgPaceSecPerKm: 300 }),
  activity({
    runnerName: 'Isaac',
    distanceKm: 5,
    durationSec: 1800,
    avgPaceSecPerKm: 360,
    source: 'strava',
    startedAt: '2026-08-21T06:00:00.000Z',
  }),
  activity({
    runnerName: 'Priya',
    distanceKm: 12,
    durationSec: 3480,
    avgPaceSecPerKm: 290,
    startedAt: '2026-08-22T06:00:00.000Z',
  }),
];

describe('buildLeaderboard', () => {
  it('ranks by total distance and aggregates per runner', () => {
    const entries = buildLeaderboard({ activities, roastCounts: new Map(), bets: [] });

    expect(entries.map((e) => [e.rank, e.runnerName, e.totalDistanceKm])).toEqual([
      [1, 'Isaac', 15],
      [2, 'Priya', 12],
    ]);
    const isaac = entries[0];
    expect(isaac.runCount).toBe(2);
    expect(isaac.avgPaceSecPerKm).toBe(320); // 4800s over 15km
    expect(isaac.bestPaceSecPerKm).toBe(300);
    expect(isaac.sources).toEqual(['manual', 'strava']);
  });

  it('ranks by best single-activity pace', () => {
    const entries = buildLeaderboard({ activities, roastCounts: new Map(), bets: [], metric: 'pace' });
    expect(entries.map((e) => e.runnerName)).toEqual(['Priya', 'Isaac']);
  });

  it('ranks by roast count and counts settled bets', () => {
    const entries = buildLeaderboard({
      activities,
      roastCounts: new Map([['Priya', 4]]),
      bets: [bet('Isaac', 'missed'), bet('Isaac', 'won'), bet('Priya', 'won')],
      metric: 'roasts',
    });

    expect(entries[0]).toMatchObject({ runnerName: 'Priya', roastCount: 4, betsWon: 1, betsMissed: 0 });
    expect(entries[1]).toMatchObject({ runnerName: 'Isaac', roastCount: 0, betsWon: 1, betsMissed: 1 });
  });

  it('includes runners with roasts or bets but no logged activity', () => {
    const entries = buildLeaderboard({
      activities: [],
      roastCounts: new Map([['Sam', 2]]),
      bets: [bet('Nia', 'open')],
    });

    expect(entries.map((e) => e.runnerName).sort()).toEqual(['Nia', 'Sam']);
    expect(entries[0].avgPaceSecPerKm).toBeNull();
    expect(entries[0].bestPaceSecPerKm).toBeNull();
  });

  it('ignores activities older than the window', () => {
    const entries = buildLeaderboard({
      activities,
      roastCounts: new Map(),
      bets: [],
      sinceMs: Date.parse('2026-08-21T00:00:00.000Z'),
    });

    expect(entries.find((e) => e.runnerName === 'Isaac')?.totalDistanceKm).toBe(5);
  });
});
