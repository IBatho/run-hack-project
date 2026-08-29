import { describe, expect, it, vi } from 'vitest';
import {
  coachPayload,
  createCoachChannel,
  MockPokeAiCoach,
  PokeAiCoach,
  type CoachUpdate,
} from '../src/server/adapters/pokeAi.js';
import type { FetchLike } from '../src/server/adapters/voice.js';
import { loadConfig } from '../src/server/config.js';

const update: CoachUpdate = {
  event: 'run_completed',
  runnerName: 'Isaac',
  message: 'Isaac just finished a 10.20km run at 5:05/km.',
  context: { activity: { distance_km: 10.2 } },
};

const fetchMock = (status: number) =>
  vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(async () => new Response('{}', { status }));

describe('PokeAiCoach', () => {
  it('posts the documented inbound-message payload with a bearer key', async () => {
    const fetchImpl = fetchMock(200);
    const coach = new PokeAiCoach(
      { apiKey: 'poke-v2-key', baseUrl: 'https://poke.test', messagePath: '/api/v1/inbound/api-message', maxAttempts: 3 },
      fetchImpl,
    );

    const message = await coach.send(update);

    expect(message).toMatchObject({ status: 'delivered', attempts: 1, provider: 'live', error: null });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://poke.test/api/v1/inbound/api-message');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer poke-v2-key');
    expect(JSON.parse(String(init?.body))).toEqual({
      message: update.message,
      source: 'run-hack-project',
      event: 'run_completed',
      runner: 'Isaac',
      context: update.context,
    });
    expect(coach.outbox()).toHaveLength(1);
  });

  it('retries 5xx responses and records the failure', async () => {
    const fetchImpl = fetchMock(503);
    const coach = new PokeAiCoach(
      { apiKey: 'k', baseUrl: 'https://poke.test', messagePath: '/api/v1/inbound/api-message', maxAttempts: 3 },
      fetchImpl,
    );

    const message = await coach.send(update);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(message).toMatchObject({ status: 'failed', attempts: 3 });
    expect(message.error).toContain('503');
  });

  it('does not retry a rejected key', async () => {
    const fetchImpl = fetchMock(401);
    const coach = new PokeAiCoach(
      { apiKey: 'bad', baseUrl: 'https://poke.test', messagePath: '/api/v1/inbound/api-message', maxAttempts: 3 },
      fetchImpl,
    );

    const message = await coach.send(update);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(message.status).toBe('failed');
  });

  it('never puts the key in the recorded message', async () => {
    const coach = new PokeAiCoach(
      { apiKey: 'secret-key', baseUrl: 'https://poke.test', messagePath: '/p', maxAttempts: 1 },
      fetchMock(200),
    );
    const message = await coach.send(update);
    expect(JSON.stringify(message)).not.toContain('secret-key');
  });
});

describe('coachPayload', () => {
  it('keeps the instruction in `message` and the numbers in `context`', () => {
    expect(coachPayload(update)).toMatchObject({ message: update.message, context: update.context });
  });
});

describe('createCoachChannel', () => {
  it('falls back to the mock channel without a key', async () => {
    const channel = createCoachChannel(loadConfig({}));
    expect(channel).toBeInstanceOf(MockPokeAiCoach);
    expect(channel.mode).toBe('mock');
    const message = await channel.send(update);
    expect(message.status).toBe('delivered');
    expect(channel.outbox()).toHaveLength(1);
  });

  it('uses the live channel when a key is present', () => {
    const channel = createCoachChannel(loadConfig({ POKE_AI_API_KEY: 'key' }));
    expect(channel.mode).toBe('live');
    expect(channel.endpoint).toBe('https://poke.com/api/v1/inbound/api-message');
  });

  it('stays mocked when MOCK_MODE overrides the key', () => {
    expect(createCoachChannel(loadConfig({ POKE_AI_API_KEY: 'key', MOCK_MODE: '1' })).mode).toBe('mock');
  });
});
