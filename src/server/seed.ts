import type { BetService } from './services/betService.js';
import type { RoastService } from './services/roastService.js';
import type { RunStore } from './services/store.js';

/** Seeds the demo runner session and an open Ghost Pacer Bet. */
export function seedDemoData(store: RunStore, roasts: RoastService, bets: BetService): void {
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
}
