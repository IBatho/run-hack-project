import type { ProviderMode } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { modeFor } from '../config.js';
import { estimateSpeechDurationMs, synthesizeWav } from './wav.js';

export interface SynthesisRequest {
  text: string;
  voiceId: string;
}

export interface SynthesisResult {
  audio: Buffer;
  mimeType: string;
  provider: ProviderMode;
  voiceId: string;
  durationMsEstimate: number;
}

export interface VoiceProvider {
  readonly mode: ProviderMode;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'VoiceProviderError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Talks to the real ElevenLabs text-to-speech endpoint. */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly mode: ProviderMode = 'live';

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      modelId: string;
    },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async synthesize({ text, voiceId }: SynthesisRequest): Promise<SynthesisResult> {
    const url = `${this.options.baseUrl}/v1/text-to-speech/${voiceId}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.options.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: this.options.modelId,
          voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.6 },
        }),
      });
    } catch (cause) {
      throw new VoiceProviderError(`ElevenLabs request failed: ${(cause as Error).message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new VoiceProviderError(
        `ElevenLabs responded ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio,
      mimeType: response.headers.get('content-type') ?? 'audio/mpeg',
      provider: 'live',
      voiceId,
      durationMsEstimate: estimateSpeechDurationMs(text),
    };
  }
}

/** Offline stand-in that renders an audible WAV so demos work with no key. */
export class MockVoiceProvider implements VoiceProvider {
  readonly mode: ProviderMode = 'mock';

  async synthesize({ text, voiceId }: SynthesisRequest): Promise<SynthesisResult> {
    return {
      audio: synthesizeWav(text),
      mimeType: 'audio/wav',
      provider: 'mock',
      voiceId,
      durationMsEstimate: estimateSpeechDurationMs(text),
    };
  }
}

/**
 * Uses ElevenLabs when a key is present and silently degrades to the mock
 * renderer if a live call fails, so a demo never dies mid-run.
 */
export class FallbackVoiceProvider implements VoiceProvider {
  readonly mode: ProviderMode;
  private readonly mock = new MockVoiceProvider();

  constructor(
    private readonly primary: VoiceProvider | null,
    private readonly onFallback?: (error: Error) => void,
  ) {
    this.mode = primary?.mode ?? 'mock';
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    if (!this.primary) return this.mock.synthesize(request);
    try {
      return await this.primary.synthesize(request);
    } catch (error) {
      this.onFallback?.(error as Error);
      return this.mock.synthesize(request);
    }
  }
}

export function createVoiceProvider(config: AppConfig, fetchImpl: FetchLike = fetch): VoiceProvider {
  const mode = modeFor(config, Boolean(config.elevenLabs.apiKey));
  if (mode === 'mock') return new MockVoiceProvider();
  return new FallbackVoiceProvider(
    new ElevenLabsVoiceProvider(
      {
        apiKey: config.elevenLabs.apiKey as string,
        baseUrl: config.elevenLabs.baseUrl,
        modelId: config.elevenLabs.modelId,
      },
      fetchImpl,
    ),
    (error) => console.warn(`[voice] falling back to mock synthesis: ${error.message}`),
  );
}
