/**
 * Conversational run control: "start my run" typed at Poke ends up here.
 *
 * Poke reaches this through the MCP tool `start_run` or the webhook
 * `POST /api/poke/commands` (see docs/poke-recipe.md). Either way the server can
 * do everything except make sound: browsers refuse to start audio without a user
 * gesture, so a command is created in `awaiting_gesture` and only becomes `armed`
 * when the web app claims it from a tap. That handoff is the contract — Poke
 * starts the run, the tap unmutes it.
 */

import { randomUUID } from 'node:crypto';
import { formatPace } from '../../shared/pace.js';
import type { CoachMode, Roast, RunCommand, RunSession } from '../../shared/types.js';
import { parseRunIntent, SUPPORTED_PHRASES, type RunIntentName } from '../domain/runIntent.js';
import type { RoastService } from './roastService.js';
import type { RunStore } from './store.js';

export type RunCommandResult =
  | 'created'
  | 'replayed'
  | 'stopped'
  | 'roast_queued'
  | 'no_active_run'
  | 'unrecognized';

export interface RunCommandOutcome {
  /** False only when nothing could be done (unrecognised phrasing). */
  ok: boolean;
  result: RunCommandResult;
  intent: RunIntentName;
  /** True when an existing command was returned instead of a new one. */
  idempotent: boolean;
  command: RunCommand | null;
  roast: Roast | null;
  /** Message Poke should say back to the runner. */
  reply: string;
}

export interface RunCommandInput {
  /** Raw chat text; parsed with `parseRunIntent`. */
  text: string;
  /** Overrides the runner parsed from the text. */
  runnerName?: string;
  targetPaceSecPerKm?: number;
  coachMode?: CoachMode;
  conversationId?: string;
  /** Repeat requests with the same key return the first command verbatim. */
  idempotencyKey?: string;
  source: RunCommand['source'];
}

export interface RunCommandOptions {
  publicBaseUrl: string;
  /** Unclaimed commands expire after this long; default 15 minutes. */
  ttlMs?: number;
  /** Runner used when the phrase names nobody and no session exists yet. */
  defaultRunnerName?: string;
  defaultTargetPaceSecPerKm?: number;
  now?: () => number;
}

const DEFAULT_TTL_MS = 15 * 60_000;
/** Once audio is live the command must survive a whole run, not the claim window. */
const ARMED_TTL_MS = 3 * 3_600_000;
const DEFAULT_TARGET_PACE_SEC_PER_KM = 330;

const ACTIVE: RunCommand['status'][] = ['awaiting_gesture', 'armed'];

export class RunCommandService {
  private readonly commands = new Map<string, RunCommand>();
  private readonly byIdempotencyKey = new Map<string, string>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: RunStore,
    private readonly roastService: RoastService,
    private readonly options: RunCommandOptions,
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** Handles one chat message. Never throws on bad input; reports it in `reply`. */
  async dispatch(input: RunCommandInput): Promise<RunCommandOutcome> {
    this.expireStale();

    const parsed = parseRunIntent(input.text ?? '');
    const runnerName = input.runnerName?.trim() || parsed.runnerName || this.fallbackRunnerName();
    const coachMode = input.coachMode ?? parsed.coachMode;
    const targetPaceSecPerKm = input.targetPaceSecPerKm ?? parsed.targetPaceSecPerKm;

    if (input.idempotencyKey) {
      const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
      const existing = existingId ? this.commands.get(existingId) : undefined;
      if (existing) {
        return this.outcome({
          ok: true,
          result: 'replayed',
          intent: parsed.intent,
          idempotent: true,
          command: existing,
          reply: existing.reply,
        });
      }
    }

    switch (parsed.intent) {
      case 'start_run':
        return this.startRun({ ...input, runnerName, coachMode, targetPaceSecPerKm }, parsed.intent);
      case 'stop_run':
        return this.stopRun(runnerName, parsed.intent);
      case 'roast_now':
        return this.roastNow(runnerName, coachMode, parsed.intent);
      default:
        return this.outcome({
          ok: false,
          result: 'unrecognized',
          intent: parsed.intent,
          idempotent: false,
          command: null,
          reply:
            "I couldn't tell what you wanted there. Try one of: " +
            SUPPORTED_PHRASES.map((phrase) => `“${phrase}”`).join(', ') +
            '.',
        });
    }
  }

  /** Commands the web app has not claimed yet, newest first. */
  pending(runnerName?: string): RunCommand[] {
    this.expireStale();
    return [...this.commands.values()]
      .filter((command) => command.status === 'awaiting_gesture')
      .filter((command) => !runnerName || command.runnerName.toLowerCase() === runnerName.toLowerCase())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  list(): RunCommand[] {
    this.expireStale();
    return [...this.commands.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): RunCommand | undefined {
    this.expireStale();
    return this.commands.get(id);
  }

  /**
   * Called by the web app from the user's tap. `audioArmed` is the browser's own
   * report of whether the audio context is running; a claim without it stays in
   * `awaiting_gesture` so the runner is prompted again rather than running silently.
   */
  claim(id: string, input: { audioArmed: boolean }): RunCommand | undefined {
    const command = this.get(id);
    if (!command) return undefined;
    if (command.status === 'completed' || command.status === 'expired') return command;

    const updated: RunCommand = {
      ...command,
      status: input.audioArmed ? 'armed' : 'awaiting_gesture',
      audioArmed: input.audioArmed,
      claimedAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + (input.audioArmed ? ARMED_TTL_MS : this.ttlMs)).toISOString(),
      reply: input.audioArmed
        ? `Audio is live for ${command.runnerName}. Coaching in your headphones now.`
        : `${command.runnerName} opened the app but the browser has not allowed audio yet — one tap on “Start run” does it.`,
    };
    this.commands.set(id, updated);
    return updated;
  }

  complete(id: string): RunCommand | undefined {
    const command = this.get(id);
    if (!command) return undefined;
    const updated: RunCommand = { ...command, status: 'completed' };
    this.commands.set(id, updated);
    return updated;
  }

  reset(): void {
    this.commands.clear();
    this.byIdempotencyKey.clear();
  }

  private async startRun(
    input: RunCommandInput & { runnerName: string; coachMode?: CoachMode; targetPaceSecPerKm?: number },
    intent: RunIntentName,
  ): Promise<RunCommandOutcome> {
    const active = this.activeFor(input.runnerName);
    if (active) {
      // "start my run" twice in a chat must not spawn a second session.
      if (input.idempotencyKey) this.byIdempotencyKey.set(input.idempotencyKey, active.id);
      return this.outcome({
        ok: true,
        result: 'replayed',
        intent,
        idempotent: true,
        command: active,
        reply: active.reply,
      });
    }

    const session = this.sessionFor(input.runnerName, input.targetPaceSecPerKm, input.coachMode);
    const createdAt = new Date(this.now()).toISOString();
    const command: RunCommand = {
      id: randomUUID(),
      intent: 'start_run',
      status: 'awaiting_gesture',
      runnerName: session.runnerName,
      sessionId: session.id,
      coachMode: session.coachMode,
      targetPaceSecPerKm: session.targetPaceSecPerKm,
      requestText: input.text ?? '',
      reply: '',
      webAppUrl: `${this.options.publicBaseUrl}/?command=`,
      source: input.source,
      conversationId: input.conversationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt,
      claimedAt: null,
      audioArmed: false,
      expiresAt: new Date(this.now() + this.ttlMs).toISOString(),
    };
    command.webAppUrl = `${this.options.publicBaseUrl}/?command=${command.id}`;
    command.reply =
      `Run armed for ${command.runnerName} at target ${formatPace(command.targetPaceSecPerKm)} ` +
      `(${command.coachMode} coach). Open ${command.webAppUrl} and tap “Start run” once — ` +
      'browsers only allow audio after a tap, and that tap puts the coach in your headphones.';

    this.commands.set(command.id, command);
    if (input.idempotencyKey) this.byIdempotencyKey.set(input.idempotencyKey, command.id);

    return this.outcome({
      ok: true,
      result: 'created',
      intent,
      idempotent: false,
      command,
      reply: command.reply,
    });
  }

  private stopRun(runnerName: string, intent: RunIntentName): RunCommandOutcome {
    const active = this.activeFor(runnerName);
    if (!active) {
      return this.outcome({
        ok: true,
        result: 'no_active_run',
        intent,
        idempotent: false,
        command: null,
        reply: `Nothing running for ${runnerName} right now.`,
      });
    }
    const stopped = this.complete(active.id) as RunCommand;
    return this.outcome({
      ok: true,
      result: 'stopped',
      intent,
      idempotent: false,
      command: stopped,
      reply: `Coaching stopped for ${runnerName}. The web app will stop tracking on its next check.`,
    });
  }

  private async roastNow(
    runnerName: string,
    coachMode: CoachMode | undefined,
    intent: RunIntentName,
  ): Promise<RunCommandOutcome> {
    const session = this.findSession(runnerName);
    if (!session) {
      return this.outcome({
        ok: true,
        result: 'no_active_run',
        intent,
        idempotent: false,
        command: null,
        reply: `No coaching session for ${runnerName} yet — say “start my run” first.`,
      });
    }
    const roast = await this.roastService.createRoast(session, {
      trigger: 'manual',
      paceSecPerKm: null,
      coachMode,
    });
    const active = this.activeFor(session.runnerName);
    return this.outcome({
      ok: true,
      result: 'roast_queued',
      intent,
      idempotent: false,
      command: active ?? null,
      roast,
      reply:
        active?.audioArmed === true
          ? `Coming through your headphones now: “${roast.text}”`
          : `Queued: “${roast.text}” — it plays as soon as the web app has audio armed.`,
    });
  }

  private outcome(
    partial: Omit<RunCommandOutcome, 'roast'> & { roast?: Roast | null },
  ): RunCommandOutcome {
    return { roast: null, ...partial };
  }

  private activeFor(runnerName: string): RunCommand | undefined {
    this.expireStale();
    return [...this.commands.values()]
      .filter((command) => ACTIVE.includes(command.status))
      .filter((command) => command.runnerName.toLowerCase() === runnerName.toLowerCase())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private findSession(runnerName: string): RunSession | undefined {
    return this.store
      .listSessions()
      .find((session) => session.runnerName.toLowerCase() === runnerName.toLowerCase());
  }

  /** Reuses the runner's session (keeping their tuning) or creates one. */
  private sessionFor(
    runnerName: string,
    targetPaceSecPerKm: number | undefined,
    coachMode: CoachMode | undefined,
  ): RunSession {
    const existing = this.findSession(runnerName);
    if (existing) {
      if (targetPaceSecPerKm === undefined && coachMode === undefined) return existing;
      return this.roastService.updateSession(existing, { targetPaceSecPerKm, coachMode });
    }
    return this.roastService.createSession({
      runnerName,
      targetPaceSecPerKm:
        targetPaceSecPerKm ?? this.options.defaultTargetPaceSecPerKm ?? DEFAULT_TARGET_PACE_SEC_PER_KM,
      coachMode,
    });
  }

  private fallbackRunnerName(): string {
    return this.options.defaultRunnerName ?? this.store.listSessions()[0]?.runnerName ?? 'Runner';
  }

  private expireStale(): void {
    const nowMs = this.now();
    for (const [id, command] of this.commands) {
      if (!ACTIVE.includes(command.status)) continue;
      if (Date.parse(command.expiresAt) > nowMs) continue;
      this.commands.set(id, { ...command, status: 'expired' });
    }
  }
}
