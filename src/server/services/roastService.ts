import { randomUUID } from 'node:crypto';
import type { PaceSample, Roast, RunSession, SponsorHook } from '../../shared/types.js';
import type { SponsorProvider } from '../adapters/healf.js';
import type { VoiceProvider } from '../adapters/voice.js';
import { composeRoast } from '../domain/copy.js';
import { evaluatePaceSample, type RoastDecision } from '../domain/roastEngine.js';
import type { AudioStore } from './audioStore.js';
import type { RunStore } from './store.js';

export interface SampleIngestResult {
  sample: PaceSample;
  decision: RoastDecision;
  roast: Roast | null;
}

export interface SessionInput {
  runnerName: string;
  targetPaceSecPerKm: number;
  tolerancePct?: number;
  debounceSamples?: number;
  cooldownSec?: number;
  voiceId?: string;
  sponsorEnabled?: boolean;
}

export class RoastService {
  constructor(
    private readonly store: RunStore,
    private readonly voice: VoiceProvider,
    private readonly sponsor: SponsorProvider,
    private readonly audioStore: AudioStore,
    private readonly defaultVoiceId: string,
  ) {}

  createSession(input: SessionInput): RunSession {
    return this.store.putSession({
      id: randomUUID(),
      runnerName: input.runnerName,
      targetPaceSecPerKm: input.targetPaceSecPerKm,
      tolerancePct: input.tolerancePct ?? 0.05,
      debounceSamples: input.debounceSamples ?? 2,
      cooldownSec: input.cooldownSec ?? 45,
      voiceId: input.voiceId ?? this.defaultVoiceId,
      sponsorEnabled: input.sponsorEnabled ?? true,
      createdAt: new Date().toISOString(),
    });
  }

  updateSession(session: RunSession, patch: Partial<SessionInput>): RunSession {
    return this.store.putSession({
      ...session,
      runnerName: patch.runnerName ?? session.runnerName,
      targetPaceSecPerKm: patch.targetPaceSecPerKm ?? session.targetPaceSecPerKm,
      tolerancePct: patch.tolerancePct ?? session.tolerancePct,
      debounceSamples: patch.debounceSamples ?? session.debounceSamples,
      cooldownSec: patch.cooldownSec ?? session.cooldownSec,
      voiceId: patch.voiceId ?? session.voiceId,
      sponsorEnabled: patch.sponsorEnabled ?? session.sponsorEnabled,
    });
  }

  async ingestSample(
    session: RunSession,
    input: { paceSecPerKm: number; distanceKm: number; at?: number },
  ): Promise<SampleIngestResult> {
    const sample = this.store.addSample({
      id: randomUUID(),
      sessionId: session.id,
      paceSecPerKm: input.paceSecPerKm,
      distanceKm: input.distanceKm,
      at: input.at ?? Date.now(),
    });

    const decision = evaluatePaceSample(session, sample, this.store.roastState(session.id));
    this.store.setRoastState(session.id, decision.state);

    if (!decision.shouldRoast) return { sample, decision, roast: null };

    const roast = await this.createRoast(session, {
      trigger: 'threshold',
      paceSecPerKm: sample.paceSecPerKm,
      slowByPct: decision.slowByPct,
    });

    return { sample, decision, roast };
  }

  async createRoast(
    session: RunSession,
    input: {
      trigger: Roast['trigger'];
      paceSecPerKm: number | null;
      slowByPct?: number;
      text?: string;
      seed?: number;
    },
  ): Promise<Roast> {
    const paceSecPerKm = input.paceSecPerKm ?? session.targetPaceSecPerKm;
    const slowByPct = input.slowByPct ?? paceSecPerKm / session.targetPaceSecPerKm - 1;

    let sponsorHook: SponsorHook | null = null;
    if (session.sponsorEnabled) {
      sponsorHook = await this.sponsor.getHook({
        runnerName: session.runnerName,
        paceSecPerKm,
        targetPaceSecPerKm: session.targetPaceSecPerKm,
        slowByPct,
      });
    }

    const text =
      input.text?.trim() ||
      composeRoast({
        runnerName: session.runnerName,
        paceSecPerKm,
        targetPaceSecPerKm: session.targetPaceSecPerKm,
        slowByPct,
        sponsorHook,
        seed: input.seed,
      });

    let audio: Roast['audio'] = null;
    let audioError: string | null = null;
    try {
      audio = this.audioStore.save(await this.voice.synthesize({ text, voiceId: session.voiceId }));
    } catch (error) {
      audioError = (error as Error).message;
    }

    return this.store.addRoast({
      id: randomUUID(),
      sessionId: session.id,
      trigger: input.trigger,
      text,
      paceSecPerKm: input.paceSecPerKm,
      targetPaceSecPerKm: session.targetPaceSecPerKm,
      sponsorHook,
      audio,
      audioError,
      createdAt: new Date().toISOString(),
    });
  }
}
