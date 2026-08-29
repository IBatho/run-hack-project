import { describe, expect, it, vi } from 'vitest';
import {
  MockActivityProvider,
  StravaActivityProvider,
  createActivityProvider,
  paceFromSpeed,
} from '../src/server/adapters/strava.js';
import type { FetchLike } from '../src/server/adapters/voice.js';
import { loadConfig } from '../src/server/config.js';

const options = {
  clientId: '12345',
  clientSecret: 'secret',
  redirectUri: 'http://localhost:8787/api/strava/callback',
  baseUrl: 'https://www.strava.com',
  authBaseUrl: 'https://www.strava.com',
  scope: 'read,activity:read',
};

const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresAt: 0, athleteName: null };

describe('StravaActivityProvider', () => {
  it('builds the OAuth authorize url', () => {
    const url = new URL(new StravaActivityProvider(options).authorizeUrl('run-hack'));
    expect(url.origin + url.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: '12345',
      redirect_uri: options.redirectUri,
      response_type: 'code',
      scope: 'read,activity:read',
      state: 'run-hack',
    });
  });

  it('exchanges an authorization code for tokens', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'a1',
            refresh_token: 'r1',
            expires_at: 1893456000,
            athlete: { firstname: 'Isaac', lastname: 'B' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await new StravaActivityProvider(options, fetchImpl).exchangeCode('code-123');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://www.strava.com/oauth/token');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      client_id: '12345',
      client_secret: 'secret',
      grant_type: 'authorization_code',
      code: 'code-123',
    });
    expect(result).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', athleteName: 'Isaac B' });
  });

  it('refreshes with the refresh_token grant', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () => new Response(JSON.stringify({ access_token: 'a2' }), { status: 200 }),
    );

    await new StravaActivityProvider(options, fetchImpl).refresh('r1');

    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
    });
  });

  it('maps runs to pace and drops non-running activities', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 900,
              name: 'Morning Run',
              sport_type: 'Run',
              distance: 10200,
              moving_time: 3111,
              average_speed: 3.28,
              start_date: '2026-08-27T06:12:00Z',
            },
            { id: 901, name: 'Commute', sport_type: 'Ride', distance: 20000, moving_time: 2400 },
          ]),
          { status: 200 },
        ),
    );

    const activities = await new StravaActivityProvider(options, fetchImpl).listActivities(tokens, {
      afterEpochSec: 1000,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/api/v3/athlete/activities?per_page=30&after=1000');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer access');
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ externalId: '900', distanceKm: 10.2, avgPaceSecPerKm: 305 });
  });

  it('throws on non-2xx responses', async () => {
    const provider = new StravaActivityProvider(options, async () => new Response('nope', { status: 401 }));
    await expect(provider.listActivities(tokens)).rejects.toThrow('Strava activities responded 401');
    await expect(provider.exchangeCode('c')).rejects.toThrow('Strava token exchange responded 401');
  });
});

describe('MockActivityProvider', () => {
  it('returns fixture runs and filters by start time', async () => {
    const provider = new MockActivityProvider();
    const all = await provider.listActivities(tokens);
    expect(all.length).toBeGreaterThan(1);

    const recent = await provider.listActivities(tokens, {
      afterEpochSec: Date.parse('2026-08-26T00:00:00Z') / 1000,
    });
    expect(recent.map((a) => a.externalId)).toEqual(['strava-1001']);
  });
});

describe('createActivityProvider', () => {
  it('selects mode from configuration', () => {
    expect(createActivityProvider(loadConfig({})).mode).toBe('mock');
    expect(
      createActivityProvider(loadConfig({ STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's' })).mode,
    ).toBe('live');
    expect(
      createActivityProvider(
        loadConfig({ MOCK_MODE: '1', STRAVA_CLIENT_ID: '1', STRAVA_CLIENT_SECRET: 's' }),
      ).mode,
    ).toBe('mock');
  });
});

describe('paceFromSpeed', () => {
  it('converts m/s to sec/km and guards zero speed', () => {
    expect(paceFromSpeed(3.28)).toBe(305);
    expect(paceFromSpeed(0)).toBe(0);
  });
});
