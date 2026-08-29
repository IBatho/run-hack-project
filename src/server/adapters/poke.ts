import { randomUUID } from 'node:crypto';
import type { PokeDelivery, ProviderMode } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { modeFor } from '../config.js';
import type { FetchLike } from './voice.js';

export interface GroupMessage {
  groupId: string;
  text: string;
  audioUrl?: string | null;
  /** Free-form context forwarded to Poke (bet id, runner, missed targets). */
  metadata?: Record<string, unknown>;
}

export interface GroupMessenger {
  readonly mode: ProviderMode;
  send(message: GroupMessage): Promise<PokeDelivery>;
  /** Deliveries recorded by this messenger, newest first. */
  outbox(): PokeDelivery[];
}

const delivery = (
  message: GroupMessage,
  provider: ProviderMode,
  status: PokeDelivery['status'],
  attempts: number,
  error: string | null,
): PokeDelivery => ({
  id: randomUUID(),
  groupId: message.groupId,
  text: message.text,
  audioUrl: message.audioUrl ?? null,
  provider,
  status,
  attempts,
  error,
  at: new Date().toISOString(),
});

/**
 * Posts the confession to a Poke messaging webhook. Retries transient failures
 * (network errors and 5xx) up to `maxAttempts`, and always resolves with a
 * delivery record so the bet flow can surface the failure instead of crashing.
 */
export class PokeGroupMessenger implements GroupMessenger {
  readonly mode: ProviderMode = 'live';
  private readonly deliveries: PokeDelivery[] = [];

  constructor(
    private readonly options: { webhookUrl: string; apiKey: string | null; maxAttempts: number },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  outbox(): PokeDelivery[] {
    return [...this.deliveries].reverse();
  }

  async send(message: GroupMessage): Promise<PokeDelivery> {
    let lastError = 'unknown error';

    for (let attempt = 1; attempt <= Math.max(1, this.options.maxAttempts); attempt += 1) {
      try {
        const response = await this.fetchImpl(this.options.webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            group_id: message.groupId,
            message: message.text,
            audio_url: message.audioUrl ?? null,
            source: 'run-hack-project',
            metadata: message.metadata ?? {},
          }),
        });

        if (response.ok) {
          const record = delivery(message, 'live', 'delivered', attempt, null);
          this.deliveries.push(record);
          return record;
        }

        lastError = `Poke responded ${response.status}`;
        if (response.status < 500) break; // client errors are not retryable
      } catch (cause) {
        lastError = `Poke request failed: ${(cause as Error).message}`;
      }
    }

    const record = delivery(message, 'live', 'failed', Math.max(1, this.options.maxAttempts), lastError);
    this.deliveries.push(record);
    return record;
  }
}

/** In-memory Poke stand-in; can simulate N failing attempts for demos/tests. */
export class MockGroupMessenger implements GroupMessenger {
  readonly mode: ProviderMode = 'mock';
  private readonly deliveries: PokeDelivery[] = [];
  private attemptCounter = 0;

  constructor(private readonly options: { failAttempts?: number; maxAttempts?: number } = {}) {}

  outbox(): PokeDelivery[] {
    return [...this.deliveries].reverse();
  }

  async send(message: GroupMessage): Promise<PokeDelivery> {
    const failAttempts = this.options.failAttempts ?? 0;
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3);
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts += 1;
      this.attemptCounter += 1;
      if (this.attemptCounter > failAttempts) {
        const record = delivery(message, 'mock', 'delivered', attempts, null);
        this.deliveries.push(record);
        return record;
      }
    }

    const record = delivery(
      message,
      'mock',
      'failed',
      attempts,
      `simulated Poke webhook failure (POKE_MOCK_FAIL_ATTEMPTS=${failAttempts})`,
    );
    this.deliveries.push(record);
    return record;
  }
}

export function createGroupMessenger(config: AppConfig, fetchImpl: FetchLike = fetch): GroupMessenger {
  const mode = modeFor(config, Boolean(config.poke.webhookUrl));
  if (mode === 'mock') {
    return new MockGroupMessenger({
      failAttempts: config.poke.mockFailAttempts,
      maxAttempts: config.poke.maxAttempts,
    });
  }
  return new PokeGroupMessenger(
    {
      webhookUrl: config.poke.webhookUrl as string,
      apiKey: config.poke.apiKey,
      maxAttempts: config.poke.maxAttempts,
    },
    fetchImpl,
  );
}
