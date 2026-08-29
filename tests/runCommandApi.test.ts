import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppContext } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { MCP_PATH } from '../src/server/mcp/pokeMcp.js';

let ctx: AppContext;

beforeEach(() => {
  ctx = createApp({ config: loadConfig({ MOCK_MODE: '1' }) });
});

const say = (body: Record<string, unknown>) => request(ctx.app).post('/api/poke/commands').send(body);

const startRun = async (text = 'start my run', extra: Record<string, unknown> = {}) => {
  const res = await say({ text, runnerName: 'Isaac', ...extra }).expect(201);
  return res.body;
};

describe('conversational run commands', () => {
  it('creates a run awaiting the browser gesture', async () => {
    const body = await startRun();
    expect(body).toMatchObject({
      ok: true,
      result: 'created',
      intent: 'start_run',
      idempotent: false,
      command: { status: 'awaiting_gesture', audioArmed: false, source: 'poke_webhook', runnerName: 'Isaac' },
    });
    // The reply has to tell the runner where to tap: Poke cannot start audio.
    expect(body.command.webAppUrl).toContain(`?command=${body.command.id}`);
    expect(body.reply).toMatch(/tap/i);
  });

  it('applies pace and coach mode from the sentence to the run session', async () => {
    const body = await startRun('coach me at 5:30 in drill mode');
    expect(body.command).toMatchObject({ targetPaceSecPerKm: 330, coachMode: 'drill' });

    const sessions = await request(ctx.app).get('/api/sessions').expect(200);
    expect(sessions.body.sessions.find((s: { id: string }) => s.id === body.command.sessionId)).toMatchObject({
      targetPaceSecPerKm: 330,
      coachMode: 'drill',
    });
  });

  it('is idempotent by key and never starts a second concurrent run', async () => {
    const first = await startRun('start my run', { idempotencyKey: 'abc' });
    const replay = await say({ text: 'start my run', runnerName: 'Isaac', idempotencyKey: 'abc' }).expect(200);
    expect(replay.body).toMatchObject({ result: 'replayed', idempotent: true });
    expect(replay.body.command.id).toBe(first.command.id);

    const again = await say({ text: 'start coaching', runnerName: 'Isaac' }).expect(200);
    expect(again.body).toMatchObject({ result: 'replayed', idempotent: true });
    expect(again.body.command.id).toBe(first.command.id);
  });

  it('hands the command to the web app, which arms audio from the tap', async () => {
    const { command } = await startRun();

    const pending = await request(ctx.app).get('/api/run-commands?runnerName=Isaac').expect(200);
    expect(pending.body.pending.map((item: { id: string }) => item.id)).toEqual([command.id]);

    // A claim without audio keeps the command pending so the runner is asked again.
    const blocked = await request(ctx.app)
      .post(`/api/run-commands/${command.id}/claim`)
      .send({ audioArmed: false })
      .expect(200);
    expect(blocked.body.command).toMatchObject({ status: 'awaiting_gesture', audioArmed: false });
    expect(blocked.body.command.reply).toMatch(/has not allowed audio/i);

    const armed = await request(ctx.app)
      .post(`/api/run-commands/${command.id}/claim`)
      .send({ audioArmed: true })
      .expect(200);
    expect(armed.body.command).toMatchObject({ status: 'armed', audioArmed: true });
    expect(armed.body.command.claimedAt).toBeTruthy();

    const stillPending = await request(ctx.app).get('/api/run-commands').expect(200);
    expect(stillPending.body.pending).toEqual([]);

    const done = await request(ctx.app).post(`/api/run-commands/${command.id}/complete`).expect(200);
    expect(done.body.command.status).toBe('completed');
  });

  it('roasts on demand and reports whether audio is live', async () => {
    const { command } = await startRun();
    const queued = await say({ text: 'roast me', runnerName: 'Isaac' }).expect(200);
    expect(queued.body).toMatchObject({ result: 'roast_queued', intent: 'roast_now' });
    expect(queued.body.roast.text).toBeTruthy();
    expect(queued.body.reply).toMatch(/as soon as/i);

    await request(ctx.app).post(`/api/run-commands/${command.id}/claim`).send({ audioArmed: true }).expect(200);
    const live = await say({ text: 'roast me', runnerName: 'Isaac' }).expect(200);
    expect(live.body.reply).toMatch(/headphones/i);
  });

  it('stops a run and reports when there is nothing to stop', async () => {
    const idle = await say({ text: 'stop my run', runnerName: 'Nobody' }).expect(200);
    expect(idle.body).toMatchObject({ result: 'no_active_run', intent: 'stop_run', command: null });

    const { command } = await startRun();
    const stopped = await say({ text: 'stop my run', runnerName: 'Isaac' }).expect(200);
    expect(stopped.body.command).toMatchObject({ id: command.id, status: 'completed' });
  });

  it('answers unrecognised phrasing with the supported commands', async () => {
    const res = await say({ text: 'what is the weather', runnerName: 'Isaac' }).expect(422);
    expect(res.body).toMatchObject({ ok: false, result: 'unrecognized', intent: 'unknown' });
    expect(res.body.reply).toMatch(/start my run/);
  });

  it('validates the request body', async () => {
    await say({ runnerName: 'Isaac' }).expect(400);
    await say({ text: '   ' }).expect(400);
    await say({ text: 'start my run', coachMode: 'sarcastic' }).expect(400);
    await say({ text: 'start my run', targetPaceSecPerKm: 0 }).expect(400);
    await request(ctx.app).get('/api/run-commands/missing').expect(404);
    await request(ctx.app).post('/api/run-commands/missing/claim').send({ audioArmed: true }).expect(404);
    const { command } = await startRun();
    await request(ctx.app).post(`/api/run-commands/${command.id}/claim`).send({}).expect(400);
  });

  it('rejects unauthenticated webhook calls when a token is configured', async () => {
    const secured = createApp({ config: loadConfig({ MOCK_MODE: '1', POKE_MCP_TOKEN: 'secret-token' }) });
    await request(secured.app).post('/api/poke/commands').send({ text: 'start my run' }).expect(401);
    await request(secured.app)
      .post('/api/poke/commands')
      .set('authorization', 'Bearer secret-token')
      .send({ text: 'start my run' })
      .expect(201);
  });

  it('exposes the same flow to Poke as an MCP tool', async () => {
    const res = await request(ctx.app)
      .post(MCP_PATH)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'run_command',
          arguments: { text: 'start my run', runnerName: 'Isaac', idempotencyKey: 'mcp-1' },
        },
      })
      .expect(200);

    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload).toMatchObject({ result: 'created', command: { source: 'poke_mcp' } });

    const pending = await request(ctx.app).get('/api/run-commands').expect(200);
    expect(pending.body.pending[0].id).toBe(payload.command.id);
  });

  it('reports unusable MCP arguments as a tool error', async () => {
    const call = (args: Record<string, unknown>) =>
      request(ctx.app)
        .post(MCP_PATH)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'run_command', arguments: args } })
        .expect(200);

    expect((await call({})).body.result.isError).toBe(true);
    expect((await call({ text: 'start my run', coachMode: 'nope' })).body.result.isError).toBe(true);
    expect((await call({ text: 'do a barrel roll' })).body.result.isError).toBe(true);
  });
});
