import { randomUUID } from 'node:crypto';
import type { AudioClip } from '../../shared/types.js';
import type { SynthesisResult } from '../adapters/voice.js';

interface StoredAudio {
  buffer: Buffer;
  mimeType: string;
}

const EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};

/** Keeps generated clips in memory and exposes them over /api/audio/:id. */
export class AudioStore {
  private readonly clips = new Map<string, StoredAudio>();

  constructor(private readonly publicBaseUrl: string) {}

  save(result: SynthesisResult): AudioClip {
    const mimeType = result.mimeType.split(';')[0].trim();
    const id = `${randomUUID()}.${EXTENSIONS[mimeType] ?? 'bin'}`;
    this.clips.set(id, { buffer: result.audio, mimeType });
    return {
      id,
      url: `${this.publicBaseUrl}/api/audio/${id}`,
      mimeType,
      provider: result.provider,
      voiceId: result.voiceId,
      durationMsEstimate: result.durationMsEstimate,
    };
  }

  get(id: string): StoredAudio | undefined {
    return this.clips.get(id);
  }
}
