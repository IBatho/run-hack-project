import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

let ctx: AppContext;

beforeEach(() => {
  ctx = createApp({ config: loadConfig({ MOCK_MODE: '1' }) });
});

describe('leaderboard API', () => {
  it('ranks the seeded runners by distance and validates the metric', async () => {
    const res = await request(ctx.app).get('/api/leaderboard').expect(200);
    expect(res.body.metric).toBe('distance');
    expect(res.body.entries[0]).toMatchObject({ rank: 1, runnerName: 'Priya', runCount: 2 });

    await request(ctx.app).get('/api/leaderboard?metric=vibes').expect(400);
  });

  it('counts roasts against the runner that earned them', async () => {
    const sessions = await request(ctx.app).get('/api/sessions').expect(200);
    const id = sessions.body.sessions[0].id;
    await request(ctx.app).post(`/api/sessions/${id}/roasts`).send({ paceSecPerKm: 360 }).expect(201);

    const res = await request(ctx.app).get('/api/leaderboard?metric=roasts').expect(200);
    expect(res.body.entries[0]).toMatchObject({ runnerName: 'Isaac', roastCount: 1 });
  });

  it('adds a manually logged run and derives its pace', async () => {
    const created = await request(ctx.app)
      .post('/api/activities')
      .send({ runnerName: 'Nia', distanceKm: 8, durationSec: 1920, name: 'Lunch run' })
      .expect(201);
    expect(created.body.activity).toMatchObject({ avgPaceSecPerKm: 240, source: 'manual' });

    const board = await request(ctx.app).get('/api/leaderboard?metric=pace').expect(200);
    expect(board.body.entries[0]).toMatchObject({ runnerName: 'Nia', bestPaceSecPerKm: 240 });
  });

  it('validates activity input', async () => {
    await request(ctx.app).post('/api/activities').send({ distanceKm: 5, durationSec: 1500 }).expect(400);
    await request(ctx.app).post('/api/activities').send({ runnerName: 'A', durationSec: 1500 }).expect(400);
    await request(ctx.app).post('/api/activities').send({ runnerName: 'A', distanceKm: 5 }).expect(400);
    await request(ctx.app)
      .post('/api/activities')
      .send({ runnerName: 'A', distanceKm: 5, durationSec: 1500, source: 'garmin' })
      .expect(400);
  });
});

describe('strava API', () => {
  it('refuses to sync before the account is connected', async () => {
    const res = await request(ctx.app).post('/api/strava/sync').send({}).expect(409);
    expect(res.body.error).toBe('Strava is not connected');
  });

  it('connects, imports activities once, and feeds the leaderboard', async () => {
    const status = await request(ctx.app).get('/api/strava/status').expect(200);
    expect(status.body.strava).toMatchObject({ mode: 'mock', connected: false });

    await request(ctx.app).post('/api/strava/connect').send({ code: 'demo-code' }).expect(200);

    const first = await request(ctx.app).post('/api/strava/sync').send({ runnerName: 'Isaac' }).expect(200);
    expect(first.body.imported.length).toBeGreaterThan(0);
    expect(first.body.skipped).toBe(0);
    expect(first.body.imported[0]).toMatchObject({ source: 'strava', runnerName: 'Isaac' });

    const second = await request(ctx.app).post('/api/strava/sync').send({ runnerName: 'Isaac' }).expect(200);
    expect(second.body.imported).toHaveLength(0);
    expect(second.body.skipped).toBe(first.body.imported.length);

    const board = await request(ctx.app).get('/api/leaderboard').expect(200);
    const isaac = board.body.entries.find((entry: { runnerName: string }) => entry.runnerName === 'Isaac');
    expect(isaac.sources).toContain('strava');
  });

  it('treats a configured refresh token as an already connected account', async () => {
    const connected = createApp({
      config: loadConfig({ MOCK_MODE: '1', STRAVA_REFRESH_TOKEN: 'seeded-refresh-token' }),
    });
    const status = await request(connected.app).get('/api/strava/status').expect(200);
    expect(status.body.strava.connected).toBe(true);

    const sync = await request(connected.app).post('/api/strava/sync').send({}).expect(200);
    expect(sync.body.imported.length).toBeGreaterThan(0);
  });

  it('validates the connect payload', async () => {
    await request(ctx.app).post('/api/strava/connect').send({}).expect(400);
    await request(ctx.app).get('/api/strava/callback').expect(400);
  });
});
