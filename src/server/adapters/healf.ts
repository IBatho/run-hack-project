import type { ProviderMode, SponsorHook } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { modeFor } from '../config.js';
import type { FetchLike } from './voice.js';

export interface SponsorContext {
  runnerName: string;
  paceSecPerKm: number;
  targetPaceSecPerKm: number;
  slowByPct: number;
}

export interface SponsorProvider {
  readonly mode: ProviderMode;
  getHook(context: SponsorContext): Promise<SponsorHook>;
}

const MOCK_HOOKS: Array<Omit<SponsorHook, 'provider'>> = [
  {
    sponsor: 'Healf',
    tagline: 'Healf: feel good, move better.',
    productPlug: 'Maybe try the Healf electrolyte sachets before you attempt to call this running.',
    ctaUrl: 'https://healf.com/collections/hydration?utm_source=run-hack',
  },
  {
    sponsor: 'Healf',
    tagline: 'Healf: your four pillars, sorted.',
    productPlug: 'Healf sell magnesium for legs like yours. Buy some. Please.',
    ctaUrl: 'https://healf.com/collections/recovery?utm_source=run-hack',
  },
  {
    sponsor: 'Healf',
    tagline: 'Healf: sleep, eat, move, mind.',
    productPlug: 'Healf recovery kit is 20 percent off, which is roughly how much slower you are than target.',
    ctaUrl: 'https://healf.com/collections/bestsellers?utm_source=run-hack',
  },
];

/** Deterministic mock so demo copy is reproducible. */
export class MockSponsorProvider implements SponsorProvider {
  readonly mode: ProviderMode = 'mock';

  async getHook(context: SponsorContext): Promise<SponsorHook> {
    const index = Math.abs(Math.round(context.paceSecPerKm) + context.runnerName.length) % MOCK_HOOKS.length;
    return { ...MOCK_HOOKS[index], provider: 'mock' };
  }
}

interface HealfHookResponse {
  sponsor?: string;
  tagline?: string;
  product_plug?: string;
  cta_url?: string;
}

/**
 * Healf sponsor-hook API: POST {baseUrl}/v1/campaigns/{campaignId}/hooks with
 * the runner context, returns the sponsored line to weave into the roast.
 */
export class HealfSponsorProvider implements SponsorProvider {
  readonly mode: ProviderMode = 'live';

  constructor(
    private readonly options: { apiKey: string; baseUrl: string; campaignId: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getHook(context: SponsorContext): Promise<SponsorHook> {
    const response = await this.fetchImpl(
      `${this.options.baseUrl}/v1/campaigns/${this.options.campaignId}/hooks`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          runner: context.runnerName,
          pace_sec_per_km: context.paceSecPerKm,
          target_pace_sec_per_km: context.targetPaceSecPerKm,
          slow_by_pct: context.slowByPct,
          placement: 'audio_roast',
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Healf responded ${response.status}`);
    }

    const data = (await response.json()) as HealfHookResponse;
    return {
      sponsor: data.sponsor ?? 'Healf',
      tagline: data.tagline ?? 'Healf: feel good, move better.',
      productPlug: data.product_plug ?? '',
      ctaUrl: data.cta_url ?? 'https://healf.com',
      provider: 'live',
    };
  }
}

/** Falls back to curated Healf copy when the sponsor API is unavailable. */
export class FallbackSponsorProvider implements SponsorProvider {
  readonly mode: ProviderMode;
  private readonly mock = new MockSponsorProvider();

  constructor(
    private readonly primary: SponsorProvider | null,
    private readonly onFallback?: (error: Error) => void,
  ) {
    this.mode = primary?.mode ?? 'mock';
  }

  async getHook(context: SponsorContext): Promise<SponsorHook> {
    if (!this.primary) return this.mock.getHook(context);
    try {
      return await this.primary.getHook(context);
    } catch (error) {
      this.onFallback?.(error as Error);
      return this.mock.getHook(context);
    }
  }
}

export function createSponsorProvider(
  config: AppConfig,
  fetchImpl: FetchLike = fetch,
): SponsorProvider {
  const mode = modeFor(config, Boolean(config.healf.apiKey));
  if (mode === 'mock') return new MockSponsorProvider();
  return new FallbackSponsorProvider(
    new HealfSponsorProvider(
      {
        apiKey: config.healf.apiKey as string,
        baseUrl: config.healf.baseUrl,
        campaignId: config.healf.campaignId,
      },
      fetchImpl,
    ),
    (error) => console.warn(`[healf] falling back to curated sponsor copy: ${error.message}`),
  );
}
