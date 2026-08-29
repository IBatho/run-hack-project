import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import {
  ElevenLabsVoiceProvider,
  MockVoiceProvider,
  VOICE_SETTINGS,
  type FetchLike,
} from '../src/server/adapters/voice.js';
import { composeRoast, intensityFor } from '../src/server/domain/copy.js';

const BANNED_NAMES = ['goggins', 'david g', 'jocko', 'navy seal'];

const drillLine = (seed: number) =>
  composeRoast({
    runnerName: 'Isaac',
    paceSecPerKm: 341,
    targetPaceSecPerKm: 300,
    slowByPct: 0.137,
    sponsorHook: null,
    coachMode: 'drill',
    seed,
  });

describe('drill coach copy', () => {
  it('is aggressive, shouted and pace-aware', () => {
    const line = drillLine(0);
    expect(line).toContain('Isaac');
    expect(line).toContain('5:41/km');
    expect(line).toContain('5:00/km');
    expect(line).toMatch(/[A-Z]{3,}/);
  });

  it('never impersonates or names a real person', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const line = drillLine(seed).toLowerCase();
      for (const name of BANNED_NAMES) expect(line).not.toContain(name);
      expect(line).not.toMatch(/\bi am\b.*\bcoach\b/);
    }
  });

  it('is distinct from the sarcastic roast copy', () => {
    const roast = composeRoast({
      runnerName: 'Isaac',
      paceSecPerKm: 341,
      targetPaceSecPerKm: 300,
      slowByPct: 0.137,
      sponsorHook: null,
      seed: 0,
    });
    expect(drillLine(0)).not.toBe(roast);
  });

  it('shouts the sponsor plug when a hook is woven in', () => {
    const line = composeRoast({
      runnerName: 'Isaac',
      paceSecPerKm: 341,
      targetPaceSecPerKm: 300,
      slowByPct: 0.137,
      coachMode: 'drill',
      seed: 0,
      sponsorHook: {
        sponsor: 'Healf',
        tagline: 'Healf: feel good, move better.',
        productPlug: 'Try the Healf electrolyte sachets.',
        ctaUrl: 'https://healf.com',
        provider: 'mock',
      },
    });
    expect(line).toContain('TRY THE HEALF ELECTROLYTE SACHETS.');
  });

  it('maps modes to voice intensities', () => {
    expect(intensityFor('drill')).toBe('aggressive');
    expect(intensityFor('roast')).toBe('normal');
  });
});

describe('aggressive synthesis', () => {
  it('sends the aggressive ElevenLabs voice settings', async () => {
    const fetchImpl = vi.fn<Parameters<FetchLike>, ReturnType<FetchLike>>(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const provider = new ElevenLabsVoiceProvider(
      { apiKey: 'k', baseUrl: 'https://api.elevenlabs.io', modelId: 'm' },
      fetchImpl,
    );

    await provider.synthesize({ text: 'MOVE', voiceId: 'v', intensity: 'aggressive' });

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.voice_settings).toEqual(VOICE_SETTINGS.aggressive);
    expect(VOICE_SETTINGS.aggressive.stability).toBeLessThan(VOICE_SETTINGS.normal.stability);
  });

  it('renders a louder, faster mock clip than the normal read', async () => {
    const provider = new MockVoiceProvider();
    const text = 'Nobody is coming to carry you. Close the gap. NOW.';
    const normal = await provider.synthesize({ text, voiceId: 'v' });
    const aggressive = await provider.synthesize({ text, voiceId: 'v', intensity: 'aggressive' });

    expect(aggressive.durationMsEstimate).toBeLessThan(normal.durationMsEstimate);
    const peak = (buffer: Buffer) => {
      let max = 0;
      for (let i = 44; i + 1 < buffer.length; i += 2) max = Math.max(max, Math.abs(buffer.readInt16LE(i)));
      return max;
    };
    expect(peak(aggressive.audio)).toBeGreaterThan(peak(normal.audio));
  });
});

describe('coach mode API', () => {
  const app = () => createApp({ config: loadConfig({ MOCK_MODE: '1' }) }).app;

  const firstSessionId = async (server: ReturnType<typeof app>) => {
    const res = await request(server).get('/api/sessions').expect(200);
    return res.body.sessions[0].id as string;
  };

  it('defaults sessions to roast mode and switches to drill on PATCH', async () => {
    const server = app();
    const id = await firstSessionId(server);

    const before = await request(server).get(`/api/sessions/${id}`).expect(200);
    expect(before.body.session.coachMode).toBe('roast');

    const patched = await request(server).patch(`/api/sessions/${id}`).send({ coachMode: 'drill' }).expect(200);
    expect(patched.body.session.coachMode).toBe('drill');
  });

  it('rejects an unknown coach mode', async () => {
    const server = app();
    const id = await firstSessionId(server);
    await request(server).patch(`/api/sessions/${id}`).send({ coachMode: 'yelling' }).expect(400);
    await request(server)
      .post('/api/sessions')
      .send({ runnerName: 'A', targetPaceSecPerKm: 300, coachMode: 'yelling' })
      .expect(400);
  });

  it('honours COACH_DEFAULT_MODE for new sessions', async () => {
    const server = createApp({ config: loadConfig({ MOCK_MODE: '1', COACH_DEFAULT_MODE: 'drill' }) }).app;
    const created = await request(server)
      .post('/api/sessions')
      .send({ runnerName: 'Priya', targetPaceSecPerKm: 300 })
      .expect(201);
    expect(created.body.session.coachMode).toBe('drill');
  });

  it('fires drill copy for threshold roasts once the session is in drill mode', async () => {
    const server = app();
    const id = await firstSessionId(server);
    await request(server)
      .patch(`/api/sessions/${id}`)
      .send({ coachMode: 'drill', debounceSamples: 1, cooldownSec: 0 })
      .expect(200);

    const res = await request(server)
      .post(`/api/sessions/${id}/samples`)
      .send({ paceSecPerKm: 360, distanceKm: 3 })
      .expect(201);

    expect(res.body.roast.coachMode).toBe('drill');
    expect(res.body.roast.text).toMatch(/[A-Z]{3,}/);
    expect(res.body.roast.audio).not.toBeNull();
  });

  it('supports a one-off drill roast without changing the session mode', async () => {
    const server = app();
    const id = await firstSessionId(server);

    const res = await request(server)
      .post(`/api/sessions/${id}/roasts`)
      .send({ coachMode: 'drill', paceSecPerKm: 350 })
      .expect(201);
    expect(res.body.roast.coachMode).toBe('drill');

    const session = await request(server).get(`/api/sessions/${id}`).expect(200);
    expect(session.body.session.coachMode).toBe('roast');
  });

  it('uses the dedicated drill voice when one is configured', async () => {
    const server = createApp({
      config: loadConfig({
        MOCK_MODE: '1',
        ELEVENLABS_VOICE_ID: 'calm-voice',
        ELEVENLABS_DRILL_VOICE_ID: 'shouty-voice',
      }),
    }).app;
    const id = await firstSessionId(server);

    const roast = await request(server).post(`/api/sessions/${id}/roasts`).send({}).expect(201);
    expect(roast.body.roast.audio.voiceId).toBe('calm-voice');

    const drill = await request(server)
      .post(`/api/sessions/${id}/roasts`)
      .send({ coachMode: 'drill' })
      .expect(201);
    expect(drill.body.roast.audio.voiceId).toBe('shouty-voice');
  });
});
