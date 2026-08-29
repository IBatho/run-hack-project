import type { ActivityService } from './services/activityService.js';
import type { BetService } from './services/betService.js';
import type { RoastService } from './services/roastService.js';
import type { RunStore } from './services/store.js';

const DEMO_ACTIVITIES = [
  { runnerName: 'Isaac', name: 'Thursday club run', distanceKm: 10.2, durationSec: 3111, daysAgo: 2 },
  { runnerName: 'Priya', name: 'River loop', distanceKm: 12.4, durationSec: 3472, daysAgo: 1 },
  { runnerName: 'Priya', name: 'Track intervals', distanceKm: 6, durationSec: 1560, daysAgo: 4 },
  { runnerName: 'Sam', name: 'Parkrun', distanceKm: 5, durationSec: 1230, daysAgo: 3 },
] as const;

/** Seeds the demo runner session, an open Ghost Pacer Bet and leaderboard runs. */
export function seedDemoData(
  store: RunStore,
  roasts: RoastService,
  bets: BetService,
  activities: ActivityService,
): void {
  store.reset();

  roasts.createSession({
    runnerName: 'Isaac',
    targetPaceSecPerKm: 300, // 5:00/km
    tolerancePct: 0.05,
    debounceSamples: 2,
    cooldownSec: 30,
    sponsorEnabled: true,
  });

  bets.createBet({
    creator: 'Priya',
    runner: 'Isaac',
    groupId: 'poke-group-run-club',
    groupName: 'Thursday Run Club',
    dare: 'post the voice note of shame and buy the whole group coffee',
    stake: 'one round of oat flat whites',
    targets: [
      { label: 'Average pace under 5:10/km', kind: 'avg_pace', value: 310 },
      { label: 'Cover at least 10km', kind: 'distance', value: 10 },
    ],
  });

  for (const activity of DEMO_ACTIVITIES) {
    activities.record({
      runnerName: activity.runnerName,
      name: activity.name,
      distanceKm: activity.distanceKm,
      durationSec: activity.durationSec,
      startedAt: new Date(Date.now() - activity.daysAgo * 86_400_000).toISOString(),
    });
  }
}
