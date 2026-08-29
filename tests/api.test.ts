import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

let ctx: AppContext;

beforeEach(() => {
  ctx = createApp({ config: loadConfig({ MOCK_MODE: '1', PORT: '8787' }) });
});

const firstSessionId = async () => {
  const res = await request(ctx.app).get('/api/sessions').expect(200);
  return res.body.sessions[0].id as string;
};

const firstBetId = async () => {
  const res = await request(ctx.app).get('/api/bets').expect(200);
  return res.body.bets[0].id as string;
};

describe('health & seed', () => {
  it('reports mock providers and seeded demo data', async () => {
    const health = await request(ctx.app).get('/api/health').expect(200);
    expect(health.body).toMatchObject({
      ok: true,
      mockMode: true,
      providers: { elevenlabs: 'mock', healf: 'mock', poke: 'mock' },
    });

    const sessions = await request(ctx.app).get('/api/sessions').expect(200);
    expect(sessions.body.sessions[0]).toMatchObject({ runnerName: 'Isaac', targetPaceSecPerKm: 300 });
    expect(sessions.body.sessions[0].thresholdSecPerKm).toBe(315);
  });
});

describe('audio roast engine API', () => {
  it('validates session input', async () => {
    await request(ctx.app).post('/api/sessions').send({ runnerName: '' }).expect(400);
    await request(ctx.app).post('/api/sessions').send({ runnerName: 'A', targetPaceSecPerKm: -1 }).expect(400);
  });

  it('roasts only after the debounce and serves playable audio', async () => {
    const id = await firstSessionId();
    await request(ctx.app).patch(`/api/sessions/${id}`).send({ debounceSamples: 2, cooldownSec: 0 }).expect(200);

    const fast = await request(ctx.app)
      .post(`/api/sessions/${id}/samples`)
      .send({ paceSecPerKm: 295, distanceKm: 1 })
      .expect(201);
    expect(fast.body.roast).toBeNull();
    expect(fast.body.decision.reason).toBe('within_target');

    const slow1 = await request(ctx.app)
      .post(`/api/sessions/${id}/samples`)
      .send({ paceSecPerKm: 350, distanceKm: 2 })
      .expect(201);
    expect(slow1.body.roast).toBeNull();
    expect(slow1.body.decision.reason).toBe('debouncing');

    const slow2 = await request(ctx.app)
      .post(`/api/sessions/${id}/samples`)
      .send({ paceSecPerKm: 355, distanceKm: 3 })
      .expect(201);
    expect(slow2.body.decision.reason).toBe('threshold_crossed');
    expect(slow2.body.roast.trigger).toBe('threshold');
    expect(slow2.body.roast.sponsorHook.sponsor).toBe('Healf');
    expect(slow2.body.roast.text).toContain('Healf');
    expect(slow2.body.roast.audio.provider).toBe('mock');

    const clipPath = new URL(slow2.body.roast.audio.url).pathname;
    const audio = await request(ctx.app).get(clipPath).expect(200);
    expect(audio.headers['content-type']).toContain('audio/wav');
    expect(audio.body.length).toBeGreaterThan(1000);
  });

  it('honours a custom roast text and disabled sponsor hook', async () => {
    const id = await firstSessionId();
    await request(ctx.app).patch(`/api/sessions/${id}`).send({ sponsorEnabled: false }).expect(200);

    const res = await request(ctx.app)
      .post(`/api/sessions/${id}/roasts`)
      .send({ text: 'You call that running?', paceSecPerKm: 360 })
      .expect(201);

    expect(res.body.roast).toMatchObject({ trigger: 'manual', text: 'You call that running?', sponsorHook: null });
    expect(res.body.roast.audio.url).toContain('/api/audio/');
  });

  it('404s for unknown sessions and audio clips', async () => {
    await request(ctx.app).get('/api/sessions/nope').expect(404);
    await request(ctx.app).post('/api/sessions/nope/samples').send({ paceSecPerKm: 300 }).expect(404);
    await request(ctx.app).get('/api/audio/nope.wav').expect(404);
  });
});

describe('ghost pacer bet API', () => {
  it('validates targets', async () => {
    await request(ctx.app).post('/api/bets').send({ runner: 'Isaac' }).expect(400);
    await request(ctx.app)
      .post('/api/bets')
      .send({ runner: 'Isaac', groupId: 'g', targets: [{ kind: 'vibes', value: 1 }] })
      .expect(400);
  });

  it('keeps the bet open mid-run and sends the confession to Poke on a missed target', async () => {
    const id = await firstBetId();

    const mid = await request(ctx.app)
      .post(`/api/bets/${id}/progress`)
      .send({ distanceKm: 6, avgPaceSecPerKm: 335, elapsedSec: 2010 })
      .expect(200);
    expect(mid.body.bet.status).toBe('in_progress');
    expect(mid.body.confession).toBeNull();
    expect(mid.body.evaluation.atRiskTargetIds).toHaveLength(2);

    const final = await request(ctx.app)
      .post(`/api/bets/${id}/progress`)
      .send({ distanceKm: 8.4, avgPaceSecPerKm: 338, elapsedSec: 2839, final: true })
      .expect(200);

    expect(final.body.bet.status).toBe('missed');
    expect(final.body.bet.missedTargetIds).toHaveLength(2);
    expect(final.body.confession.text).toContain('confession');
    expect(final.body.confession.audio.provider).toBe('mock');
    expect(final.body.confession.delivery).toMatchObject({ status: 'delivered', provider: 'mock' });

    const outbox = await request(ctx.app).get('/api/poke/outbox').expect(200);
    expect(outbox.body.deliveries).toHaveLength(1);
    expect(outbox.body.deliveries[0].audioUrl).toContain('/api/audio/');
  });

  it('settles as won without sending anything to Poke', async () => {
    const id = await firstBetId();
    const final = await request(ctx.app)
      .post(`/api/bets/${id}/progress`)
      .send({ distanceKm: 10.2, avgPaceSecPerKm: 299, final: true })
      .expect(200);

    expect(final.body.bet.status).toBe('won');
    expect(final.body.confession).toBeNull();
    const outbox = await request(ctx.app).get('/api/poke/outbox').expect(200);
    expect(outbox.body.deliveries).toHaveLength(0);
  });

  it('surfaces Poke webhook failures on the confession instead of erroring', async () => {
    const failing = createApp({
      config: loadConfig({ MOCK_MODE: '1', POKE_MOCK_FAIL_ATTEMPTS: '10', POKE_MAX_ATTEMPTS: '2' }),
    });
    const bets = await request(failing.app).get('/api/bets').expect(200);

    const final = await request(failing.app)
      .post(`/api/bets/${bets.body.bets[0].id}/progress`)
      .send({ distanceKm: 5, avgPaceSecPerKm: 400, final: true })
      .expect(200);

    expect(final.body.bet.status).toBe('missed');
    expect(final.body.confession.delivery).toMatchObject({ status: 'failed', attempts: 2 });
    expect(final.body.confession.delivery.error).toContain('simulated');
    expect(final.body.confession.audio).not.toBeNull();
  });

  it('creates a new bet and resets demo data', async () => {
    const created = await request(ctx.app)
      .post('/api/bets')
      .send({
        runner: 'Sam',
        groupId: 'poke-group-2',
        groupName: 'Track Tuesdays',
        targets: [{ label: 'Sub 4:30/km', kind: 'avg_pace', value: 270 }],
      })
      .expect(201);
    expect(created.body.bet).toMatchObject({ runner: 'Sam', creator: 'Sam', status: 'open' });

    const afterCreate = await request(ctx.app).get('/api/bets').expect(200);
    expect(afterCreate.body.bets).toHaveLength(2);

    await request(ctx.app).post('/api/demo/reset').expect(200);
    const afterReset = await request(ctx.app).get('/api/bets').expect(200);
    expect(afterReset.body.bets).toHaveLength(1);
  });
});
