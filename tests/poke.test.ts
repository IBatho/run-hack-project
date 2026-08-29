import { describe, expect, it, vi } from 'vitest';
import {
  MockGroupMessenger,
  PokeGroupMessenger,
  createGroupMessenger,
} from '../src/server/adapters/poke.js';
import type { FetchLike } from '../src/server/adapters/voice.js';
import { loadConfig } from '../src/server/config.js';

const message = {
  groupId: 'poke-group-run-club',
  text: 'Isaac missed the bet',
  audioUrl: 'http://localhost:8787/api/audio/clip.wav',
  metadata: { bet_id: 'bet-1' },
};

describe('PokeGroupMessenger', () => {
  it('posts the confession payload to the webhook', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () => new Response('{}', { status: 200 }),
    );
    const messenger = new PokeGroupMessenger(
      { webhookUrl: 'https://poke.test/hook', apiKey: 'poke-key', maxAttempts: 3 },
      fetchImpl,
    );

    const delivery = await messenger.send(message);

    expect(delivery).toMatchObject({ status: 'delivered', attempts: 1, provider: 'live', error: null });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://poke.test/hook');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer poke-key');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      group_id: message.groupId,
      message: message.text,
      audio_url: message.audioUrl,
      source: 'run-hack-project',
      metadata: { bet_id: 'bet-1' },
    });
    expect(messenger.outbox()).toHaveLength(1);
  });

  it('retries 5xx responses up to maxAttempts then reports failure', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () => new Response('upstream down', { status: 503 }),
    );
    const messenger = new PokeGroupMessenger(
      { webhookUrl: 'https://poke.test/hook', apiKey: null, maxAttempts: 3 },
      fetchImpl,
    );

    const delivery = await messenger.send(message);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delivery.status).toBe('failed');
    expect(delivery.attempts).toBe(3);
    expect(delivery.error).toContain('503');
  });

  it('does not retry 4xx responses', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () => new Response('bad group', { status: 404 }),
    );
    const messenger = new PokeGroupMessenger(
      { webhookUrl: 'https://poke.test/hook', apiKey: null, maxAttempts: 3 },
      fetchImpl,
    );

    const delivery = await messenger.send(message);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delivery.status).toBe('failed');
    expect(delivery.error).toContain('404');
  });

  it('retries network errors and succeeds on a later attempt', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls < 2) throw new Error('socket hang up');
      return new Response('{}', { status: 200 });
    };
    const messenger = new PokeGroupMessenger(
      { webhookUrl: 'https://poke.test/hook', apiKey: null, maxAttempts: 3 },
      fetchImpl,
    );

    const delivery = await messenger.send(message);

    expect(delivery.status).toBe('delivered');
    expect(delivery.attempts).toBe(2);
  });
});

describe('MockGroupMessenger', () => {
  it('records deliveries in the outbox, newest first', async () => {
    const messenger = new MockGroupMessenger();
    await messenger.send({ ...message, text: 'first' });
    await messenger.send({ ...message, text: 'second' });

    expect(messenger.outbox().map((d) => d.text)).toEqual(['second', 'first']);
    expect(messenger.outbox()[0]).toMatchObject({ provider: 'mock', status: 'delivered' });
  });

  it('simulates configured failures', async () => {
    const messenger = new MockGroupMessenger({ failAttempts: 5, maxAttempts: 2 });
    const delivery = await messenger.send(message);
    expect(delivery).toMatchObject({ status: 'failed', attempts: 2 });
    expect(delivery.error).toContain('simulated');
  });
});

describe('createGroupMessenger', () => {
  it('picks the mode from configuration', () => {
    expect(createGroupMessenger(loadConfig({})).mode).toBe('mock');
    expect(createGroupMessenger(loadConfig({ POKE_WEBHOOK_URL: 'https://poke.test/hook' })).mode).toBe('live');
    expect(
      createGroupMessenger(loadConfig({ POKE_WEBHOOK_URL: 'https://poke.test/hook', MOCK_MODE: 'true' })).mode,
    ).toBe('mock');
  });
});
