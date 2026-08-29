import express, { type Express, type Request, type Response } from 'express';
import type { LeaderboardMetric, ProviderStatus } from '../shared/types.js';
import { createGroupMessenger } from './adapters/poke.js';
import { createSponsorProvider } from './adapters/healf.js';
import { createActivityProvider } from './adapters/strava.js';
import { createVoiceProvider, type FetchLike } from './adapters/voice.js';
import { loadConfig, type AppConfig } from './config.js';
import { paceThreshold } from './domain/roastEngine.js';
import { seedDemoData } from './seed.js';
import { ActivityService } from './services/activityService.js';
import { AudioStore } from './services/audioStore.js';
import { BetService } from './services/betService.js';
import { RoastService } from './services/roastService.js';
import { RunStore } from './services/store.js';

export interface AppDeps {
  config?: AppConfig;
  fetchImpl?: FetchLike;
  seed?: boolean;
}

export interface AppContext {
  app: Express;
  config: AppConfig;
  store: RunStore;
  roastService: RoastService;
  betService: BetService;
  activityService: ActivityService;
  providers: ProviderStatus;
}

const number = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const bad = (res: Response, message: string) => res.status(400).json({ error: message });

export function createApp(deps: AppDeps = {}): AppContext {
  const config = deps.config ?? loadConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const voice = createVoiceProvider(config, fetchImpl);
  const sponsor = createSponsorProvider(config, fetchImpl);
  const messenger = createGroupMessenger(config, fetchImpl);
  const activityProvider = createActivityProvider(config, fetchImpl);
  const providers: ProviderStatus = {
    elevenlabs: voice.mode,
    healf: sponsor.mode,
    poke: messenger.mode,
    strava: activityProvider.mode,
  };

  const store = new RunStore();
  const audioStore = new AudioStore(config.publicBaseUrl);
  const roastService = new RoastService(store, voice, sponsor, audioStore, config.elevenLabs.defaultVoiceId);
  const betService = new BetService(store, voice, messenger, audioStore, config.elevenLabs.defaultVoiceId);
  const activityService = new ActivityService(
    store,
    activityProvider,
    config.strava.runnerName,
    config.strava.refreshToken,
  );

  if (deps.seed !== false) seedDemoData(store, roastService, betService, activityService);

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mockMode: config.forceMock, providers });
  });

  app.get('/api/audio/:id', (req, res) => {
    const clip = audioStore.get(req.params.id);
    if (!clip) return res.status(404).json({ error: 'audio clip not found' });
    res.setHeader('content-type', clip.mimeType);
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin', '*');
    return res.send(clip.buffer);
  });

  // --- Audio Roast Engine -------------------------------------------------
  app.get('/api/sessions', (_req, res) => {
    res.json({
      sessions: store.listSessions().map((session) => ({
        ...session,
        thresholdSecPerKm: paceThreshold(session),
      })),
    });
  });

  app.post('/api/sessions', (req, res) => {
    const { runnerName } = req.body ?? {};
    const targetPaceSecPerKm = number(req.body?.targetPaceSecPerKm);
    if (!runnerName || typeof runnerName !== 'string') return bad(res, 'runnerName is required');
    if (!targetPaceSecPerKm || targetPaceSecPerKm <= 0) {
      return bad(res, 'targetPaceSecPerKm must be a positive number of seconds per km');
    }
    const session = roastService.createSession({
      runnerName,
      targetPaceSecPerKm,
      tolerancePct: number(req.body?.tolerancePct),
      debounceSamples: number(req.body?.debounceSamples),
      cooldownSec: number(req.body?.cooldownSec),
      voiceId: req.body?.voiceId,
      sponsorEnabled: req.body?.sponsorEnabled,
    });
    return res.status(201).json({ session });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'session not found' });
    return res.json({
      session: { ...session, thresholdSecPerKm: paceThreshold(session) },
      samples: store.listSamples(session.id),
      roasts: store.listRoasts(session.id),
      state: store.roastState(session.id),
    });
  });

  app.patch('/api/sessions/:id', (req, res) => {
    const session = store.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'session not found' });
    const updated = roastService.updateSession(session, {
      runnerName: req.body?.runnerName,
      targetPaceSecPerKm: number(req.body?.targetPaceSecPerKm),
      tolerancePct: number(req.body?.tolerancePct),
      debounceSamples: number(req.body?.debounceSamples),
      cooldownSec: number(req.body?.cooldownSec),
      voiceId: req.body?.voiceId,
      sponsorEnabled: req.body?.sponsorEnabled,
    });
    return res.json({ session: { ...updated, thresholdSecPerKm: paceThreshold(updated) } });
  });

  app.post('/api/sessions/:id/samples', async (req, res, next) => {
    try {
      const session = store.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'session not found' });
      const paceSecPerKm = number(req.body?.paceSecPerKm);
      if (!paceSecPerKm || paceSecPerKm <= 0) return bad(res, 'paceSecPerKm must be a positive number');
      const result = await roastService.ingestSample(session, {
        paceSecPerKm,
        distanceKm: number(req.body?.distanceKm) ?? 0,
        at: number(req.body?.at),
      });
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/sessions/:id/roasts', async (req, res, next) => {
    try {
      const session = store.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'session not found' });
      const roast = await roastService.createRoast(session, {
        trigger: 'manual',
        paceSecPerKm: number(req.body?.paceSecPerKm) ?? null,
        text: req.body?.text,
        seed: number(req.body?.seed),
      });
      return res.status(201).json({ roast });
    } catch (error) {
      return next(error);
    }
  });

  // --- Ghost Pacer Bet ----------------------------------------------------
  app.get('/api/bets', (_req, res) => {
    res.json({ bets: store.listBets() });
  });

  app.post('/api/bets', (req, res) => {
    const { creator, runner, groupId, groupName, dare, stake, targets } = req.body ?? {};
    if (!runner || !groupId) return bad(res, 'runner and groupId are required');
    if (!Array.isArray(targets) || targets.length === 0) return bad(res, 'at least one target is required');
    for (const target of targets) {
      if (target?.kind !== 'avg_pace' && target?.kind !== 'distance') {
        return bad(res, "target.kind must be 'avg_pace' or 'distance'");
      }
      if (number(target?.value) === undefined) return bad(res, 'target.value must be a number');
    }
    const bet = betService.createBet({
      creator: creator ?? runner,
      runner,
      groupId,
      groupName: groupName ?? groupId,
      dare: dare ?? 'record a voice note of shame',
      stake: stake ?? 'bragging rights',
      voiceId: req.body?.voiceId,
      targets: targets.map((t: { label?: string; kind: 'avg_pace' | 'distance'; value: number }) => ({
        label: t.label ?? (t.kind === 'avg_pace' ? 'Average pace target' : 'Distance target'),
        kind: t.kind,
        value: Number(t.value),
      })),
    });
    return res.status(201).json({ bet });
  });

  app.get('/api/bets/:id', (req, res) => {
    const bet = store.getBet(req.params.id);
    if (!bet) return res.status(404).json({ error: 'bet not found' });
    return res.json({ bet });
  });

  app.post('/api/bets/:id/progress', async (req, res, next) => {
    try {
      const bet = store.getBet(req.params.id);
      if (!bet) return res.status(404).json({ error: 'bet not found' });
      const distanceKm = number(req.body?.distanceKm);
      const avgPaceSecPerKm = number(req.body?.avgPaceSecPerKm);
      if (distanceKm === undefined || avgPaceSecPerKm === undefined) {
        return bad(res, 'distanceKm and avgPaceSecPerKm are required');
      }
      const result = await betService.recordProgress(
        bet,
        { distanceKm, avgPaceSecPerKm, elapsedSec: number(req.body?.elapsedSec) ?? 0, at: number(req.body?.at) },
        { final: req.body?.final === true },
      );
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/poke/outbox', (_req, res) => {
    res.json({ provider: providers.poke, deliveries: betService.outbox() });
  });

  // --- Leaderboard --------------------------------------------------------
  app.get('/api/leaderboard', (req, res) => {
    const metric = (req.query.metric as LeaderboardMetric | undefined) ?? 'distance';
    if (metric !== 'distance' && metric !== 'pace' && metric !== 'roasts') {
      return bad(res, "metric must be 'distance', 'pace' or 'roasts'");
    }
    const days = number(req.query.days);
    const sinceMs = days === undefined ? undefined : Date.now() - days * 86_400_000;
    return res.json({ metric, entries: activityService.leaderboard(metric, sinceMs) });
  });

  app.get('/api/activities', (_req, res) => {
    res.json({ activities: store.listActivities() });
  });

  app.post('/api/activities', (req, res) => {
    const { runnerName, name, source, sessionId, startedAt } = req.body ?? {};
    const distanceKm = number(req.body?.distanceKm);
    const durationSec = number(req.body?.durationSec);
    if (!runnerName || typeof runnerName !== 'string') return bad(res, 'runnerName is required');
    if (distanceKm === undefined || distanceKm <= 0) return bad(res, 'distanceKm must be positive');
    if (durationSec === undefined || durationSec <= 0) return bad(res, 'durationSec must be positive');
    if (source !== undefined && source !== 'manual' && source !== 'strava' && source !== 'ios') {
      return bad(res, "source must be 'manual', 'strava' or 'ios'");
    }
    const activity = activityService.record({
      runnerName,
      distanceKm,
      durationSec,
      name,
      source,
      sessionId,
      startedAt,
    });
    return res.status(201).json({ activity });
  });

  // --- Strava tracking ----------------------------------------------------
  app.get('/api/strava/status', (_req, res) => {
    res.json({ strava: activityService.stravaStatus() });
  });

  app.post('/api/strava/connect', async (req, res, next) => {
    try {
      const code = req.body?.code;
      if (!code || typeof code !== 'string') return bad(res, 'code is required');
      return res.json({ strava: await activityService.connect(code) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/strava/callback', async (req, res, next) => {
    try {
      const code = req.query.code;
      if (typeof code !== 'string') return bad(res, 'code query parameter is required');
      return res.json({ strava: await activityService.connect(code) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/strava/sync', async (req, res, next) => {
    try {
      const result = await activityService.sync({
        runnerName: req.body?.runnerName,
        afterEpochSec: number(req.body?.afterEpochSec),
      });
      return res.json(result);
    } catch (error) {
      if ((error as Error).message === 'Strava is not connected') {
        return res.status(409).json({ error: (error as Error).message });
      }
      return next(error);
    }
  });

  app.post('/api/demo/reset', (_req, res) => {
    seedDemoData(store, roastService, betService, activityService);
    res.json({ ok: true, sessions: store.listSessions(), bets: store.listBets() });
  });

  app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error('[api] unhandled error', error);
    res.status(500).json({ error: error.message });
  });

  return { app, config, store, roastService, betService, activityService, providers };
}
