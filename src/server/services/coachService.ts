import { formatPace } from '../../shared/pace.js';
import type {
  PokeCoachMessage,
  PokeStatus,
  Roast,
  RunActivity,
  RunSession,
} from '../../shared/types.js';
import type { CoachChannel } from '../adapters/pokeAi.js';
import type { ActivityService } from './activityService.js';
import type { RunStore } from './store.js';

export interface CoachServiceOptions {
  mcpPath: string;
  mcpAuthRequired: boolean;
}

/**
 * Turns run data into coaching instructions for Poke.
 *
 * Every message carries a short natural-language instruction (what Poke's agent
 * should do) plus a structured `context` object (the numbers it should use), so
 * the agent never has to parse prose to get the run data.
 */
export class CoachService {
  private lastSyncAt: string | null = null;
  private sent = 0;

  constructor(
    private readonly store: RunStore,
    private readonly activities: ActivityService,
    private readonly channel: CoachChannel,
    private readonly options: CoachServiceOptions,
  ) {}

  status(): PokeStatus {
    return {
      mode: this.channel.mode,
      endpoint: this.channel.endpoint,
      lastSyncAt: this.lastSyncAt,
      messagesSent: this.sent,
      mcpPath: this.options.mcpPath,
      mcpAuthRequired: this.options.mcpAuthRequired,
    };
  }

  outbox(): PokeCoachMessage[] {
    return this.channel.outbox();
  }

  private async send(update: Parameters<CoachChannel['send']>[0]): Promise<PokeCoachMessage> {
    const message = await this.channel.send(update);
    this.sent += 1;
    this.lastSyncAt = message.at;
    return message;
  }

  /** Pushed when a run finishes (browser tracker, manual entry or Strava import). */
  async runCompleted(activity: RunActivity): Promise<PokeCoachMessage> {
    const history = this.store
      .listActivities()
      .filter((item) => item.runnerName === activity.runnerName && item.id !== activity.id);
    const rank = this.activities
      .leaderboard('distance')
      .find((entry) => entry.runnerName === activity.runnerName);

    return this.send({
      event: 'run_completed',
      runnerName: activity.runnerName,
      message:
        `${activity.runnerName} just finished a ${activity.distanceKm.toFixed(2)}km run at ` +
        `${formatPace(activity.avgPaceSecPerKm)}. Review it against their recent runs and reply with ` +
        'one specific coaching cue for the next session.',
      context: {
        activity: {
          id: activity.id,
          name: activity.name,
          source: activity.source,
          distance_km: activity.distanceKm,
          duration_sec: activity.durationSec,
          avg_pace_sec_per_km: activity.avgPaceSecPerKm,
          started_at: activity.startedAt,
        },
        recent_runs: history.slice(0, 5).map((item) => ({
          distance_km: item.distanceKm,
          avg_pace_sec_per_km: item.avgPaceSecPerKm,
          source: item.source,
          started_at: item.startedAt,
        })),
        leaderboard: rank
          ? {
              rank: rank.rank,
              total_distance_km: rank.totalDistanceKm,
              avg_pace_sec_per_km: rank.avgPaceSecPerKm,
              roast_count: rank.roastCount,
            }
          : null,
      },
    });
  }

  /** Pushed when the roast engine fires, so Poke can follow up mid-training-block. */
  async roastFired(session: RunSession, roast: Roast): Promise<PokeCoachMessage> {
    return this.send({
      event: 'roast_fired',
      runnerName: session.runnerName,
      message:
        `${session.runnerName} drifted off target pace mid-run` +
        (roast.paceSecPerKm ? ` (${formatPace(roast.paceSecPerKm)} vs target ` : ' (target ') +
        `${formatPace(roast.targetPaceSecPerKm)}). Note it for their next check-in.`,
      context: {
        session_id: session.id,
        roast_id: roast.id,
        trigger: roast.trigger,
        pace_sec_per_km: roast.paceSecPerKm,
        target_pace_sec_per_km: roast.targetPaceSecPerKm,
        text: roast.text,
        audio_url: roast.audio?.url ?? null,
      },
    });
  }

  /** On-demand summary of the whole leaderboard, sent from the dashboard. */
  async digest(runnerName?: string): Promise<PokeCoachMessage> {
    const entries = this.activities.leaderboard('distance');
    const focus = runnerName ?? entries[0]?.runnerName ?? 'the club';
    const recent = this.store
      .listActivities()
      .filter((item) => !runnerName || item.runnerName === runnerName)
      .slice(0, 10);

    return this.send({
      event: 'digest',
      runnerName: focus,
      message:
        `Weekly run digest for ${focus}. Summarise the trend across these runs and suggest one ` +
        'training focus for the coming week.',
      context: {
        leaderboard: entries.map((entry) => ({
          rank: entry.rank,
          runner: entry.runnerName,
          runs: entry.runCount,
          total_distance_km: entry.totalDistanceKm,
          avg_pace_sec_per_km: entry.avgPaceSecPerKm,
          best_pace_sec_per_km: entry.bestPaceSecPerKm,
          roasts: entry.roastCount,
          bets_won: entry.betsWon,
          bets_missed: entry.betsMissed,
        })),
        recent_runs: recent.map((item) => ({
          runner: item.runnerName,
          name: item.name,
          source: item.source,
          distance_km: item.distanceKm,
          avg_pace_sec_per_km: item.avgPaceSecPerKm,
          started_at: item.startedAt,
        })),
      },
    });
  }
}
