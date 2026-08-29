import type { ProviderMode } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { modeFor } from '../config.js';
import type { FetchLike } from './voice.js';

export interface StravaTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch seconds at which the access token expires. */
  expiresAt: number;
  athleteName: string | null;
}

/** A Strava activity normalised to the shape the leaderboard stores. */
export interface ProviderActivity {
  externalId: string;
  name: string;
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  /** Average speed in m/s as reported by the provider. */
  avgSpeedMps: number;
  startedAt: string;
}

export interface ActivityProvider {
  readonly mode: ProviderMode;
  /** Null when no client id is configured, i.e. the OAuth dance cannot start. */
  authorizeUrl(state: string): string | null;
  exchangeCode(code: string): Promise<StravaTokens>;
  refresh(refreshToken: string): Promise<StravaTokens>;
  listActivities(tokens: StravaTokens, options?: { afterEpochSec?: number; perPage?: number }): Promise<ProviderActivity[]>;
}

export const paceFromSpeed = (metresPerSecond: number): number =>
  metresPerSecond > 0 ? Math.round(1000 / metresPerSecond) : 0;

const MOCK_ACTIVITIES: ProviderActivity[] = [
  {
    externalId: 'strava-1001',
    name: 'Thursday club run',
    distanceKm: 10.2,
    durationSec: 3111,
    avgPaceSecPerKm: 305,
    avgSpeedMps: 3.28,
    startedAt: '2026-08-27T06:12:00.000Z',
  },
  {
    externalId: 'strava-1002',
    name: 'Recovery shuffle',
    distanceKm: 5.05,
    durationSec: 1868,
    avgPaceSecPerKm: 370,
    avgSpeedMps: 2.7,
    startedAt: '2026-08-25T17:40:00.000Z',
  },
  {
    externalId: 'strava-1003',
    name: 'Parkrun',
    distanceKm: 5.0,
    durationSec: 1290,
    avgPaceSecPerKm: 258,
    avgSpeedMps: 3.88,
    startedAt: '2026-08-23T08:00:00.000Z',
  },
];

/** Offline Strava stand-in so the leaderboard demo runs without OAuth. */
export class MockActivityProvider implements ActivityProvider {
  readonly mode: ProviderMode = 'mock';

  authorizeUrl(state: string): string {
    return `https://www.strava.com/oauth/authorize?mock=1&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(): Promise<StravaTokens> {
    return {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      athleteName: 'Mock Athlete',
    };
  }

  async refresh(): Promise<StravaTokens> {
    return this.exchangeCode();
  }

  async listActivities(
    _tokens: StravaTokens,
    options: { afterEpochSec?: number } = {},
  ): Promise<ProviderActivity[]> {
    if (options.afterEpochSec === undefined) return [...MOCK_ACTIVITIES];
    return MOCK_ACTIVITIES.filter(
      (activity) => Date.parse(activity.startedAt) / 1000 > (options.afterEpochSec as number),
    );
  }
}

interface StravaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { firstname?: string; lastname?: string };
}

interface StravaActivityResponse {
  id: number | string;
  name?: string;
  type?: string;
  sport_type?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  start_date?: string;
}

/**
 * Strava OAuth + activity import.
 *
 * Uses the standard authorization-code flow (`activity:read` scope) and reads
 * `GET /api/v3/athlete/activities`, keeping only running activities. Speed is
 * converted to pace here so the rest of the app keeps working in sec/km.
 */
export class StravaActivityProvider implements ActivityProvider {
  readonly mode: ProviderMode = 'live';

  constructor(
    private readonly options: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      baseUrl: string;
      authBaseUrl: string;
      scope: string;
    },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: this.options.scope,
      state,
    });
    return `${this.options.authBaseUrl}/oauth/authorize?${params.toString()}`;
  }

  exchangeCode(code: string): Promise<StravaTokens> {
    return this.token({ grant_type: 'authorization_code', code });
  }

  refresh(refreshToken: string): Promise<StravaTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async token(grant: Record<string, string>): Promise<StravaTokens> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...grant,
      }),
    });

    if (!response.ok) throw new Error(`Strava token exchange responded ${response.status}`);

    const data = (await response.json()) as StravaTokenResponse;
    if (!data.access_token) throw new Error('Strava token response had no access_token');

    const athlete = [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(' ').trim();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      athleteName: athlete || null,
    };
  }

  async listActivities(
    tokens: StravaTokens,
    options: { afterEpochSec?: number; perPage?: number } = {},
  ): Promise<ProviderActivity[]> {
    const params = new URLSearchParams({ per_page: String(options.perPage ?? 30) });
    if (options.afterEpochSec !== undefined) params.set('after', String(options.afterEpochSec));

    const response = await this.fetchImpl(
      `${this.options.baseUrl}/api/v3/athlete/activities?${params.toString()}`,
      { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    );

    if (!response.ok) throw new Error(`Strava activities responded ${response.status}`);

    const data = (await response.json()) as StravaActivityResponse[];
    return data
      .filter((activity) => (activity.sport_type ?? activity.type ?? 'Run').includes('Run'))
      .map((activity) => {
        const distanceKm = (activity.distance ?? 0) / 1000;
        const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0;
        const avgSpeedMps =
          activity.average_speed ?? (durationSec > 0 ? (activity.distance ?? 0) / durationSec : 0);
        return {
          externalId: String(activity.id),
          name: activity.name ?? 'Strava run',
          distanceKm,
          durationSec,
          avgPaceSecPerKm:
            distanceKm > 0 ? Math.round(durationSec / distanceKm) : paceFromSpeed(avgSpeedMps),
          avgSpeedMps,
          startedAt: activity.start_date ?? new Date().toISOString(),
        };
      });
  }
}

export function createActivityProvider(config: AppConfig, fetchImpl: FetchLike = fetch): ActivityProvider {
  const mode = modeFor(config, Boolean(config.strava.clientId && config.strava.clientSecret));
  if (mode === 'mock') return new MockActivityProvider();
  return new StravaActivityProvider(
    {
      clientId: config.strava.clientId as string,
      clientSecret: config.strava.clientSecret as string,
      redirectUri: config.strava.redirectUri,
      baseUrl: config.strava.baseUrl,
      authBaseUrl: config.strava.authBaseUrl,
      scope: config.strava.scope,
    },
    fetchImpl,
  );
}
