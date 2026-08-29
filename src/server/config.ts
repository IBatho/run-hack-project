import type { ProviderMode } from '../shared/types.js';

export interface AppConfig {
  port: number;
  publicBaseUrl: string;
  /** Force every provider into mock mode regardless of credentials. */
  forceMock: boolean;
  elevenLabs: {
    apiKey: string | null;
    baseUrl: string;
    modelId: string;
    defaultVoiceId: string;
  };
  healf: {
    apiKey: string | null;
    baseUrl: string;
    campaignId: string;
  };
  poke: {
    webhookUrl: string | null;
    apiKey: string | null;
    maxAttempts: number;
    /** Mock mode only: fail this many attempts before succeeding (demo of retries). */
    mockFailAttempts: number;
  };
  strava: {
    clientId: string | null;
    clientSecret: string | null;
    /** Long-lived refresh token, so a restarted server can sync without re-authorising. */
    refreshToken: string | null;
    redirectUri: string;
    baseUrl: string;
    authBaseUrl: string;
    scope: string;
    /** Runner name imported activities are attributed to on the leaderboard. */
    runnerName: string;
  };
}

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
};

const str = (value: string | undefined): string | null => (value && value.trim() ? value.trim() : null);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = num(env.PORT, 8787);
  return {
    port,
    publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, '') || `http://localhost:${port}`,
    forceMock: env.MOCK_MODE === '1' || env.MOCK_MODE === 'true',
    elevenLabs: {
      apiKey: str(env.ELEVENLABS_API_KEY),
      baseUrl: env.ELEVENLABS_BASE_URL?.replace(/\/$/, '') || 'https://api.elevenlabs.io',
      modelId: env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
      defaultVoiceId: env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    },
    healf: {
      apiKey: str(env.HEALF_API_KEY),
      baseUrl: env.HEALF_API_URL?.replace(/\/$/, '') || 'https://api.healf.com',
      campaignId: env.HEALF_CAMPAIGN_ID || 'healf-run-hack',
    },
    poke: {
      webhookUrl: str(env.POKE_WEBHOOK_URL),
      apiKey: str(env.POKE_API_KEY),
      maxAttempts: num(env.POKE_MAX_ATTEMPTS, 3),
      mockFailAttempts: num(env.POKE_MOCK_FAIL_ATTEMPTS, 0),
    },
    strava: {
      clientId: str(env.STRAVA_CLIENT_ID),
      clientSecret: str(env.STRAVA_CLIENT_SECRET),
      refreshToken: str(env.STRAVA_REFRESH_TOKEN),
      redirectUri: env.STRAVA_REDIRECT_URI || `http://localhost:${port}/api/strava/callback`,
      baseUrl: env.STRAVA_API_BASE_URL?.replace(/\/$/, '') || 'https://www.strava.com',
      authBaseUrl: env.STRAVA_AUTH_BASE_URL?.replace(/\/$/, '') || 'https://www.strava.com',
      scope: env.STRAVA_SCOPE || 'read,activity:read',
      runnerName: env.STRAVA_RUNNER_NAME || 'Isaac',
    },
  };
}

export const modeFor = (config: AppConfig, hasCredentials: boolean): ProviderMode =>
  !config.forceMock && hasCredentials ? 'live' : 'mock';
