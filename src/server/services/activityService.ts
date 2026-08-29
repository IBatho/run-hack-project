import { randomUUID } from 'node:crypto';
import type {
  ActivitySource,
  LeaderboardEntry,
  LeaderboardMetric,
  RunActivity,
  StravaStatus,
} from '../../shared/types.js';
import type { ActivityProvider, StravaTokens } from '../adapters/strava.js';
import { buildLeaderboard } from '../domain/leaderboard.js';
import type { RunStore } from './store.js';

export interface ActivityInput {
  runnerName: string;
  distanceKm: number;
  durationSec: number;
  name?: string;
  source?: ActivitySource;
  sessionId?: string | null;
  externalId?: string | null;
  startedAt?: string;
}

export interface SyncResult {
  imported: RunActivity[];
  /** Activities already present (matched on Strava activity id). */
  skipped: number;
  status: StravaStatus;
}

/**
 * Records completed runs and keeps the leaderboard in sync with them.
 *
 * Strava tokens live in memory alongside the rest of the prototype state; a
 * `STRAVA_REFRESH_TOKEN` in the environment is treated as an already-connected
 * account so a restarted server can sync without redoing the OAuth redirect.
 */
export class ActivityService {
  private tokens: StravaTokens | null = null;
  private lastSyncAt: string | null = null;

  constructor(
    private readonly store: RunStore,
    private readonly provider: ActivityProvider,
    private readonly stravaRunnerName: string,
    seedRefreshToken: string | null = null,
  ) {
    if (seedRefreshToken) {
      this.tokens = {
        accessToken: '',
        refreshToken: seedRefreshToken,
        expiresAt: 0,
        athleteName: null,
      };
    }
  }

  record(input: ActivityInput): RunActivity {
    const distanceKm = input.distanceKm;
    const durationSec = input.durationSec;
    return this.store.addActivity({
      id: randomUUID(),
      externalId: input.externalId ?? null,
      source: input.source ?? 'manual',
      runnerName: input.runnerName,
      sessionId: input.sessionId ?? null,
      name: input.name ?? 'Run',
      distanceKm,
      durationSec,
      avgPaceSecPerKm: distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0,
      startedAt: input.startedAt ?? new Date().toISOString(),
    });
  }

  leaderboard(metric: LeaderboardMetric = 'distance', sinceMs?: number): LeaderboardEntry[] {
    return buildLeaderboard({
      activities: this.store.listActivities(),
      roastCounts: this.store.roastCountsByRunner(),
      bets: this.store.listBets(),
      metric,
      sinceMs,
    });
  }

  stravaStatus(): StravaStatus {
    return {
      mode: this.provider.mode,
      connected: this.tokens !== null,
      athleteName: this.tokens?.athleteName ?? null,
      lastSyncAt: this.lastSyncAt,
      authorizeUrl: this.provider.authorizeUrl('run-hack'),
    };
  }

  async connect(code: string): Promise<StravaStatus> {
    this.tokens = await this.provider.exchangeCode(code);
    return this.stravaStatus();
  }

  async sync(options: { runnerName?: string; afterEpochSec?: number } = {}): Promise<SyncResult> {
    if (!this.tokens) throw new Error('Strava is not connected');

    const nowSec = Math.floor(Date.now() / 1000);
    if (this.tokens.expiresAt <= nowSec && this.tokens.refreshToken) {
      this.tokens = await this.provider.refresh(this.tokens.refreshToken);
    }

    const activities = await this.provider.listActivities(this.tokens, {
      afterEpochSec: options.afterEpochSec,
    });

    const runnerName = options.runnerName ?? this.tokens.athleteName ?? this.stravaRunnerName;
    const imported: RunActivity[] = [];
    let skipped = 0;

    for (const activity of activities) {
      if (this.store.findActivityByExternalId('strava', activity.externalId)) {
        skipped += 1;
        continue;
      }
      imported.push(
        this.store.addActivity({
          id: randomUUID(),
          externalId: activity.externalId,
          source: 'strava',
          runnerName,
          sessionId: null,
          name: activity.name,
          distanceKm: activity.distanceKm,
          durationSec: activity.durationSec,
          avgPaceSecPerKm: activity.avgPaceSecPerKm,
          startedAt: activity.startedAt,
        }),
      );
    }

    this.lastSyncAt = new Date().toISOString();
    return { imported, skipped, status: this.stravaStatus() };
  }
}
