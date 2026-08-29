import type {
  ActivitySource,
  Bet,
  LeaderboardEntry,
  LeaderboardMetric,
  PaceSample,
  PokeDelivery,
  ProviderStatus,
  Roast,
  RunActivity,
  RunSession,
  StravaStatus,
} from '../shared/types.js';
import type { BetEvaluation } from '../server/domain/betEngine.js';
import type { RoastDecision } from '../server/domain/roastEngine.js';

export type SessionWithThreshold = RunSession & { thresholdSecPerKm: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `request failed (${response.status})`);
  return body;
}

export const api = {
  health: () => request<{ ok: boolean; mockMode: boolean; providers: ProviderStatus }>('/api/health'),

  listSessions: () => request<{ sessions: SessionWithThreshold[] }>('/api/sessions'),

  getSession: (id: string) =>
    request<{
      session: SessionWithThreshold;
      samples: PaceSample[];
      roasts: Roast[];
    }>(`/api/sessions/${id}`),

  updateSession: (id: string, patch: Partial<RunSession>) =>
    request<{ session: SessionWithThreshold }>(`/api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  createSession: (input: { runnerName: string; targetPaceSecPerKm: number }) =>
    request<{ session: SessionWithThreshold }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  addSample: (id: string, input: { paceSecPerKm: number; distanceKm: number }) =>
    request<{ sample: PaceSample; decision: RoastDecision; roast: Roast | null }>(
      `/api/sessions/${id}/samples`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  manualRoast: (id: string, input: { text?: string; paceSecPerKm?: number }) =>
    request<{ roast: Roast }>(`/api/sessions/${id}/roasts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listBets: () => request<{ bets: Bet[] }>('/api/bets'),

  createBet: (input: Record<string, unknown>) =>
    request<{ bet: Bet }>('/api/bets', { method: 'POST', body: JSON.stringify(input) }),

  progress: (
    id: string,
    input: { distanceKm: number; avgPaceSecPerKm: number; elapsedSec?: number; final?: boolean },
  ) =>
    request<{ bet: Bet; evaluation: BetEvaluation }>(`/api/bets/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  outbox: () => request<{ provider: string; deliveries: PokeDelivery[] }>('/api/poke/outbox'),

  leaderboard: (metric: LeaderboardMetric) =>
    request<{ metric: LeaderboardMetric; entries: LeaderboardEntry[] }>(`/api/leaderboard?metric=${metric}`),

  listActivities: () => request<{ activities: RunActivity[] }>('/api/activities'),

  addActivity: (input: {
    runnerName: string;
    distanceKm: number;
    durationSec: number;
    name?: string;
    source?: ActivitySource;
  }) => request<{ activity: RunActivity }>('/api/activities', { method: 'POST', body: JSON.stringify(input) }),

  stravaStatus: () => request<{ strava: StravaStatus }>('/api/strava/status'),

  stravaConnect: (code: string) =>
    request<{ strava: StravaStatus }>('/api/strava/connect', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  stravaSync: (runnerName?: string) =>
    request<{ imported: RunActivity[]; skipped: number; strava: StravaStatus }>('/api/strava/sync', {
      method: 'POST',
      body: JSON.stringify(runnerName ? { runnerName } : {}),
    }),

  reset: () => request<{ ok: boolean }>('/api/demo/reset', { method: 'POST' }),
};
