import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { MCP_PATH } from '../src/server/mcp/pokeMcp.js';

let ctx: AppContext;

beforeEach(() => {
  ctx = createApp({ config: loadConfig({ MOCK_MODE: '1' }) });
});

const rpc = (method: string, params?: Record<string, unknown>, id: number | null = 1) =>
  request(ctx.app).post(MCP_PATH).send({ jsonrpc: '2.0', id, method, params });

const toolJson = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc('tools/call', { name, arguments: args }).expect(200);
  return { result: res.body.result, payload: JSON.parse(res.body.result.content[0].text) };
};

describe('Poke MCP endpoint', () => {
  it('handshakes and lists the run tools', async () => {
    const init = await rpc('initialize').expect(200);
    expect(init.body.result).toMatchObject({ serverInfo: { name: 'run-hack-project' } });

    const tools = await rpc('tools/list').expect(200);
    expect(tools.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_leaderboard',
      'list_recent_runs',
      'get_runner_summary',
      'log_run',
      'run_command',
    ]);
  });

  it('answers notifications with no body', async () => {
    await request(ctx.app)
      .post(MCP_PATH)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      .expect(202);
  });

  it('rejects unsupported methods', async () => {
    const res = await rpc('resources/list').expect(200);
    expect(res.body.error).toMatchObject({ code: -32601 });
  });

  it('reads the leaderboard and recent runs', async () => {
    const board = await toolJson('get_leaderboard', { metric: 'pace' });
    expect(board.payload.metric).toBe('pace');
    expect(board.payload.entries.length).toBeGreaterThan(0);

    const runs = await toolJson('list_recent_runs', { limit: 2 });
    expect(runs.payload.runs).toHaveLength(2);

    const summary = await toolJson('get_runner_summary', { runnerName: 'isaac' });
    expect(summary.payload.summary.runnerName).toBe('Isaac');
  });

  it('flags bad tool arguments instead of throwing', async () => {
    expect((await toolJson('get_leaderboard', { metric: 'vibes' })).result.isError).toBe(true);
    expect((await toolJson('get_runner_summary', { runnerName: 'Nobody' })).result.isError).toBe(true);
    expect((await toolJson('log_run', { runnerName: 'Isaac', distanceKm: 0, durationSec: 10 })).result.isError).toBe(
      true,
    );
    expect((await toolJson('nope')).result.isError).toBe(true);
  });

  it('logs a run from Poke onto the leaderboard', async () => {
    const { payload } = await toolJson('log_run', {
      runnerName: 'Kwame',
      distanceKm: 10,
      durationSec: 3000,
    });
    expect(payload.activity).toMatchObject({ source: 'poke', avgPaceSecPerKm: 300 });

    const activities = await request(ctx.app).get('/api/activities').expect(200);
    expect(activities.body.activities.some((a: { id: string }) => a.id === payload.activity.id)).toBe(true);
  });

  it('requires the bearer token when POKE_MCP_TOKEN is set', async () => {
    const secured = createApp({ config: loadConfig({ MOCK_MODE: '1', POKE_MCP_TOKEN: 'mcp-token' }) });
    const body = { jsonrpc: '2.0', id: 1, method: 'ping' };

    await request(secured.app).post(MCP_PATH).send(body).expect(401);
    await request(secured.app).post(MCP_PATH).set('authorization', 'Bearer wrong').send(body).expect(401);
    await request(secured.app).post(MCP_PATH).set('authorization', 'Bearer mcp-token').send(body).expect(200);
    expect(secured.coachService.status().mcpAuthRequired).toBe(true);
  });
});

describe('Poke coaching sync API', () => {
  it('reports mock status and an empty outbox before anything is sent', async () => {
    const res = await request(ctx.app).get('/api/poke/status').expect(200);
    expect(res.body.poke).toMatchObject({
      mode: 'mock',
      messagesSent: 0,
      lastSyncAt: null,
      mcpPath: MCP_PATH,
      mcpAuthRequired: false,
    });
    expect(res.body.messages).toEqual([]);
  });

  it('pushes coaching context when a run is recorded', async () => {
    const res = await request(ctx.app)
      .post('/api/activities')
      .send({ runnerName: 'Isaac', distanceKm: 10, durationSec: 3000, source: 'web' })
      .expect(201);

    expect(res.body.coaching).toMatchObject({ event: 'run_completed', runnerName: 'Isaac', status: 'delivered' });
    expect(res.body.coaching.context.activity).toMatchObject({ distance_km: 10, avg_pace_sec_per_km: 300 });
    expect(res.body.coaching.context.leaderboard).not.toBeNull();

    const status = await request(ctx.app).get('/api/poke/status').expect(200);
    expect(status.body.poke.messagesSent).toBe(1);
    expect(status.body.poke.lastSyncAt).not.toBeNull();
  });

  it('sends a leaderboard digest on demand', async () => {
    const res = await request(ctx.app).post('/api/poke/digest').send({ runnerName: 'Isaac' }).expect(200);
    expect(res.body.message).toMatchObject({ event: 'digest', runnerName: 'Isaac' });
    expect(res.body.message.context.leaderboard.length).toBeGreaterThan(0);
    expect(res.body.message.context.recent_runs.every((run: { runner: string }) => run.runner === 'Isaac')).toBe(true);
  });

  it('pushes a coaching message when a roast fires', async () => {
    const sessions = await request(ctx.app).get('/api/sessions').expect(200);
    const session = sessions.body.sessions[0];
    await request(ctx.app)
      .patch(`/api/sessions/${session.id}`)
      .send({ debounceSamples: 1, cooldownSec: 0 })
      .expect(200);

    const sample = await request(ctx.app)
      .post(`/api/sessions/${session.id}/samples`)
      .send({ paceSecPerKm: session.targetPaceSecPerKm + 120, distanceKm: 1 })
      .expect(201);
    expect(sample.body.roast).not.toBeNull();

    const status = await request(ctx.app).get('/api/poke/status').expect(200);
    expect(status.body.messages[0]).toMatchObject({ event: 'roast_fired', runnerName: session.runnerName });
  });
});
