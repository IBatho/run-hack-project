import { randomUUID } from 'node:crypto';
import type { CoachMode, PaceSample, Roast, RunSession, SponsorHook } from '../../shared/types.js';
import type { SponsorProvider } from '../adapters/healf.js';
import type { VoiceProvider } from '../adapters/voice.js';
import { composeRoast, intensityFor } from '../domain/copy.js';
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
  coachMode?: CoachMode;
  sponsorEnabled?: boolean;
}

export interface RoastVoiceOptions {
  defaultVoiceId: string;
  /** Optional dedicated voice for drill mode (`ELEVENLABS_DRILL_VOICE_ID`). */
  drillVoiceId?: string | null;
  /** Coaching personality new sessions start in. */
  defaultCoachMode?: CoachMode;
}

export class RoastService {
  private readonly defaultVoiceId: string;
  private readonly drillVoiceId: string | null;
  private readonly defaultCoachMode: CoachMode;

  constructor(
    private readonly store: RunStore,
    private readonly voice: VoiceProvider,
    private readonly sponsor: SponsorProvider,
    private readonly audioStore: AudioStore,
    voiceOptions: RoastVoiceOptions,
  ) {
    this.defaultVoiceId = voiceOptions.defaultVoiceId;
    this.drillVoiceId = voiceOptions.drillVoiceId ?? null;
    this.defaultCoachMode = voiceOptions.defaultCoachMode ?? 'roast';
  }

  /** Drill mode uses its dedicated voice when one is configured. */
  private voiceIdFor(session: RunSession, coachMode: CoachMode): string {
    if (coachMode === 'drill' && this.drillVoiceId) return this.drillVoiceId;
    return session.voiceId;
  }

  createSession(input: SessionInput): RunSession {
    return this.store.putSession({
      id: randomUUID(),
      runnerName: input.runnerName,
      targetPaceSecPerKm: input.targetPaceSecPerKm,
      tolerancePct: input.tolerancePct ?? 0.05,
      debounceSamples: input.debounceSamples ?? 2,
      cooldownSec: input.cooldownSec ?? 45,
      voiceId: input.voiceId ?? this.defaultVoiceId,
      coachMode: input.coachMode ?? this.defaultCoachMode,
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
      coachMode: patch.coachMode ?? session.coachMode,
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
      /** One-off personality override; defaults to the session's mode. */
      coachMode?: CoachMode;
    },
  ): Promise<Roast> {
    const paceSecPerKm = input.paceSecPerKm ?? session.targetPaceSecPerKm;
    const slowByPct = input.slowByPct ?? paceSecPerKm / session.targetPaceSecPerKm - 1;
    const coachMode = input.coachMode ?? session.coachMode;

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
        coachMode,
        seed: input.seed,
      });

    let audio: Roast['audio'] = null;
    let audioError: string | null = null;
    try {
      audio = this.audioStore.save(
        await this.voice.synthesize({
          text,
          voiceId: this.voiceIdFor(session, coachMode),
          intensity: intensityFor(coachMode),
        }),
      );
    } catch (error) {
      audioError = (error as Error).message;
    }

    return this.store.addRoast({
      id: randomUUID(),
      sessionId: session.id,
      trigger: input.trigger,
      coachMode,
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
