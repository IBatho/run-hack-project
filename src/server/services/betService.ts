import { randomUUID } from 'node:crypto';
import type { Bet, BetConfession, BetProgress, BetTarget } from '../../shared/types.js';
import type { GroupMessenger } from '../adapters/poke.js';
import type { VoiceProvider } from '../adapters/voice.js';
import { evaluateBet, type BetEvaluation } from '../domain/betEngine.js';
import { composeConfession } from '../domain/copy.js';
import type { AudioStore } from './audioStore.js';
import type { RunStore } from './store.js';

export interface BetInput {
  creator: string;
  runner: string;
  groupId: string;
  groupName: string;
  dare: string;
  stake: string;
  targets: Array<Omit<BetTarget, 'id'> & { id?: string }>;
  voiceId?: string;
}

export interface ProgressResult {
  bet: Bet;
  evaluation: BetEvaluation;
  confession: BetConfession | null;
}

export class BetService {
  constructor(
    private readonly store: RunStore,
    private readonly voice: VoiceProvider,
    private readonly messenger: GroupMessenger,
    private readonly audioStore: AudioStore,
    private readonly defaultVoiceId: string,
  ) {}

  createBet(input: BetInput): Bet {
    return this.store.putBet({
      id: randomUUID(),
      creator: input.creator,
      runner: input.runner,
      groupId: input.groupId,
      groupName: input.groupName,
      dare: input.dare,
      stake: input.stake,
      targets: input.targets.map((t) => ({ ...t, id: t.id ?? randomUUID() })),
      status: 'open',
      missedTargetIds: [],
      progress: null,
      confession: null,
      voiceId: input.voiceId ?? this.defaultVoiceId,
      createdAt: new Date().toISOString(),
      settledAt: null,
    });
  }

  /**
   * Records a progress snapshot. A `final` snapshot settles the bet, and a
   * missed target triggers the ElevenLabs confession plus Poke delivery.
   */
  async recordProgress(
    bet: Bet,
    progress: Omit<BetProgress, 'at'> & { at?: number },
    opts: { final: boolean },
  ): Promise<ProgressResult> {
    const snapshot: BetProgress = { ...progress, at: progress.at ?? Date.now() };
    const evaluation = evaluateBet(bet, snapshot, opts);

    let updated = this.store.putBet({
      ...bet,
      progress: snapshot,
      status: evaluation.status,
      missedTargetIds: evaluation.missedTargetIds,
      settledAt: opts.final ? new Date().toISOString() : null,
    });

    if (evaluation.status !== 'missed') {
      return { bet: updated, evaluation, confession: null };
    }

    const confession = await this.deliverConfession(updated, evaluation);
    updated = this.store.putBet({ ...updated, confession });
    return { bet: updated, evaluation, confession };
  }

  private async deliverConfession(bet: Bet, evaluation: BetEvaluation): Promise<BetConfession> {
    const missed = evaluation.targetResults.filter((r) => !r.met);
    const text = composeConfession({
      runner: bet.runner,
      groupName: bet.groupName,
      dare: bet.dare,
      stake: bet.stake,
      missed,
      targets: bet.targets,
    });

    let audio: BetConfession['audio'] = null;
    let audioError: string | null = null;
    try {
      audio = this.audioStore.save(await this.voice.synthesize({ text, voiceId: bet.voiceId }));
    } catch (error) {
      audioError = (error as Error).message;
    }

    const delivery = await this.messenger.send({
      groupId: bet.groupId,
      text: `🎙️ ${bet.runner} missed the Ghost Pacer Bet. Voice note of shame attached.`,
      audioUrl: audio?.url ?? null,
      metadata: {
        bet_id: bet.id,
        runner: bet.runner,
        dare: bet.dare,
        stake: bet.stake,
        missed_targets: missed.map((m) => ({ id: m.targetId, label: m.label, shortfall: m.shortfall })),
        confession_text: text,
      },
    });

    return {
      id: randomUUID(),
      text,
      audio,
      audioError,
      delivery,
      createdAt: new Date().toISOString(),
    };
  }

  outbox() {
    return this.messenger.outbox();
  }
}
