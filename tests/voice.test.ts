import { describe, expect, it, vi } from 'vitest';
import {
  ElevenLabsVoiceProvider,
  FallbackVoiceProvider,
  MockVoiceProvider,
  VoiceProviderError,
  createVoiceProvider,
  type FetchLike,
} from '../src/server/adapters/voice.js';
import { loadConfig } from '../src/server/config.js';

const audioResponse = () =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });

describe('MockVoiceProvider', () => {
  it('renders a playable WAV buffer with a RIFF header', async () => {
    const result = await new MockVoiceProvider().synthesize({ text: 'you are slow', voiceId: 'v1' });
    expect(result.provider).toBe('mock');
    expect(result.mimeType).toBe('audio/wav');
    expect(result.audio.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(result.audio.length).toBeGreaterThan(1000);
    expect(result.durationMsEstimate).toBeGreaterThan(0);
  });

  it('is deterministic for the same text', async () => {
    const provider = new MockVoiceProvider();
    const a = await provider.synthesize({ text: 'same text', voiceId: 'v1' });
    const b = await provider.synthesize({ text: 'same text', voiceId: 'v1' });
    expect(a.audio.equals(b.audio)).toBe(true);
  });
});

describe('ElevenLabsVoiceProvider', () => {
  const options = { apiKey: 'key-123', baseUrl: 'https://api.elevenlabs.io', modelId: 'eleven_turbo_v2_5' };

  it('posts the text to the voice endpoint and returns audio', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () => audioResponse());
    const provider = new ElevenLabsVoiceProvider(options, fetchImpl);

    const result = await provider.synthesize({ text: 'roast me', voiceId: 'voice-abc' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-abc');
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('key-123');
    expect(JSON.parse(String(init?.body))).toMatchObject({ text: 'roast me', model_id: 'eleven_turbo_v2_5' });
    expect(result.provider).toBe('live');
    expect(result.mimeType).toBe('audio/mpeg');
  });

  it('throws a VoiceProviderError with the upstream status', async () => {
    const fetchImpl: FetchLike = async () => new Response('quota exceeded', { status: 429 });
    const provider = new ElevenLabsVoiceProvider(options, fetchImpl);

    await expect(provider.synthesize({ text: 'hi', voiceId: 'v' })).rejects.toMatchObject({
      name: 'VoiceProviderError',
      status: 429,
    });
  });

  it('wraps network failures', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(
      new ElevenLabsVoiceProvider(options, fetchImpl).synthesize({ text: 'hi', voiceId: 'v' }),
    ).rejects.toBeInstanceOf(VoiceProviderError);
  });
});

describe('FallbackVoiceProvider', () => {
  it('degrades to mock audio when the live provider fails', async () => {
    const onFallback = vi.fn();
    const failing = {
      mode: 'live' as const,
      synthesize: async () => {
        throw new VoiceProviderError('boom', 500);
      },
    };
    const provider = new FallbackVoiceProvider(failing, onFallback);

    const result = await provider.synthesize({ text: 'still works', voiceId: 'v' });

    expect(provider.mode).toBe('live');
    expect(result.provider).toBe('mock');
    expect(onFallback).toHaveBeenCalledOnce();
  });
});

describe('createVoiceProvider', () => {
  it('returns mock mode without an API key', () => {
    expect(createVoiceProvider(loadConfig({})).mode).toBe('mock');
  });

  it('returns live mode with a key, and mock when MOCK_MODE is forced', () => {
    expect(createVoiceProvider(loadConfig({ ELEVENLABS_API_KEY: 'k' })).mode).toBe('live');
    expect(createVoiceProvider(loadConfig({ ELEVENLABS_API_KEY: 'k', MOCK_MODE: '1' })).mode).toBe('mock');
  });
});
