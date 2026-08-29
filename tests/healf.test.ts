import { describe, expect, it, vi } from 'vitest';
import {
  FallbackSponsorProvider,
  HealfSponsorProvider,
  MockSponsorProvider,
  createSponsorProvider,
} from '../src/server/adapters/healf.js';
import type { FetchLike } from '../src/server/adapters/voice.js';
import { loadConfig } from '../src/server/config.js';

const context = {
  runnerName: 'Isaac',
  paceSecPerKm: 341,
  targetPaceSecPerKm: 300,
  slowByPct: 0.137,
};

describe('HealfSponsorProvider', () => {
  it('requests a sponsor hook for the campaign and maps the response', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () =>
        new Response(
          JSON.stringify({
            sponsor: 'Healf',
            tagline: 'Healf: feel good.',
            product_plug: 'Try the hydration bundle.',
            cta_url: 'https://healf.com/x',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const provider = new HealfSponsorProvider(
      { apiKey: 'healf-key', baseUrl: 'https://api.healf.com', campaignId: 'healf-run-hack' },
      fetchImpl,
    );

    const hook = await provider.getHook(context);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.healf.com/v1/campaigns/healf-run-hack/hooks');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer healf-key');
    expect(JSON.parse(String(init?.body))).toMatchObject({ runner: 'Isaac', placement: 'audio_roast' });
    expect(hook).toMatchObject({ provider: 'live', productPlug: 'Try the hydration bundle.' });
  });

  it('throws on non-2xx so the fallback can take over', async () => {
    const provider = new HealfSponsorProvider(
      { apiKey: 'k', baseUrl: 'https://api.healf.com', campaignId: 'c' },
      async () => new Response('nope', { status: 500 }),
    );
    await expect(provider.getHook(context)).rejects.toThrow('Healf responded 500');
  });
});

describe('FallbackSponsorProvider', () => {
  it('serves curated Healf copy when the sponsor API fails', async () => {
    const onFallback = vi.fn();
    const provider = new FallbackSponsorProvider(
      {
        mode: 'live',
        getHook: async () => {
          throw new Error('sponsor api down');
        },
      },
      onFallback,
    );

    const hook = await provider.getHook(context);

    expect(hook.provider).toBe('mock');
    expect(hook.sponsor).toBe('Healf');
    expect(onFallback).toHaveBeenCalledOnce();
  });
});

describe('MockSponsorProvider', () => {
  it('is deterministic for the same runner context', async () => {
    const provider = new MockSponsorProvider();
    expect((await provider.getHook(context)).productPlug).toBe((await provider.getHook(context)).productPlug);
  });
});

describe('createSponsorProvider', () => {
  it('selects mode from configuration', () => {
    expect(createSponsorProvider(loadConfig({})).mode).toBe('mock');
    expect(createSponsorProvider(loadConfig({ HEALF_API_KEY: 'k' })).mode).toBe('live');
  });
});
