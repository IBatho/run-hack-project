import { randomUUID } from 'node:crypto';
import type { PokeCoachEvent, PokeCoachMessage, ProviderMode } from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { modeFor } from '../config.js';
import type { FetchLike } from './voice.js';

/**
 * Poke AI coaching channel.
 *
 * Poke's only documented programmatic ingress is
 * `POST https://poke.com/api/v1/inbound/api-message` with a bearer API key and
 * an arbitrary JSON body, where `message` carries the instruction and the rest
 * of the body reaches the agent as context (https://poke.com/docs/api). Nothing
 * else about Poke is assumed here: the pull direction is served by our MCP
 * endpoint (see `mcp/pokeMcp.ts`), which is the documented way for Poke to read
 * from and write to a third-party service.
 */
export interface CoachUpdate {
  event: PokeCoachEvent;
  runnerName: string;
  message: string;
  context: Record<string, unknown>;
}

export interface CoachChannel {
  readonly mode: ProviderMode;
  /** Absolute endpoint messages are posted to, surfaced in the UI for debugging. */
  readonly endpoint: string;
  send(update: CoachUpdate): Promise<PokeCoachMessage>;
  /** Coaching messages recorded by this channel, newest first. */
  outbox(): PokeCoachMessage[];
}

const record = (
  update: CoachUpdate,
  provider: ProviderMode,
  status: PokeCoachMessage['status'],
  attempts: number,
  error: string | null,
): PokeCoachMessage => ({
  id: randomUUID(),
  event: update.event,
  runnerName: update.runnerName,
  message: update.message,
  context: update.context,
  provider,
  status,
  attempts,
  error,
  at: new Date().toISOString(),
});

/** Body shape sent to Poke: documented `message` plus structured run context. */
export const coachPayload = (update: CoachUpdate): Record<string, unknown> => ({
  message: update.message,
  source: 'run-hack-project',
  event: update.event,
  runner: update.runnerName,
  context: update.context,
});

export class PokeAiCoach implements CoachChannel {
  readonly mode: ProviderMode = 'live';
  readonly endpoint: string;
  private readonly messages: PokeCoachMessage[] = [];

  constructor(
    private readonly options: { apiKey: string; baseUrl: string; messagePath: string; maxAttempts: number },
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.endpoint = `${options.baseUrl}${options.messagePath}`;
  }

  outbox(): PokeCoachMessage[] {
    return [...this.messages].reverse();
  }

  async send(update: CoachUpdate): Promise<PokeCoachMessage> {
    let lastError = 'unknown error';
    const attempts = Math.max(1, this.options.maxAttempts);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(coachPayload(update)),
        });

        if (response.ok) {
          const delivered = record(update, 'live', 'delivered', attempt, null);
          this.messages.push(delivered);
          return delivered;
        }

        lastError = `Poke responded ${response.status}`;
        if (response.status < 500) break; // bad key or bad payload; retrying won't help
      } catch (cause) {
        lastError = `Poke request failed: ${(cause as Error).message}`;
      }
    }

    const failed = record(update, 'live', 'failed', attempts, lastError);
    this.messages.push(failed);
    return failed;
  }
}

/** Records coaching messages locally so the flow is demoable without a Poke key. */
export class MockPokeAiCoach implements CoachChannel {
  readonly mode: ProviderMode = 'mock';
  readonly endpoint: string;
  private readonly messages: PokeCoachMessage[] = [];

  constructor(endpoint = 'mock://poke/api/v1/inbound/api-message') {
    this.endpoint = endpoint;
  }

  outbox(): PokeCoachMessage[] {
    return [...this.messages].reverse();
  }

  async send(update: CoachUpdate): Promise<PokeCoachMessage> {
    const delivered = record(update, 'mock', 'delivered', 1, null);
    this.messages.push(delivered);
    return delivered;
  }
}

export function createCoachChannel(config: AppConfig, fetchImpl: FetchLike = fetch): CoachChannel {
  const mode = modeFor(config, Boolean(config.pokeAi.apiKey));
  if (mode === 'mock') return new MockPokeAiCoach();
  return new PokeAiCoach(
    {
      apiKey: config.pokeAi.apiKey as string,
      baseUrl: config.pokeAi.baseUrl,
      messagePath: config.pokeAi.messagePath,
      maxAttempts: config.pokeAi.maxAttempts,
    },
    fetchImpl,
  );
}
