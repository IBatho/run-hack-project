import type { Bet, PaceSample, Roast, RunSession } from '../../shared/types.js';
import { initialRoastState, type RoastEvaluationState } from '../domain/roastEngine.js';

/** In-memory prototype store. Swap for a real DB behind the same methods. */
export class RunStore {
  private readonly sessions = new Map<string, RunSession>();
  private readonly samples = new Map<string, PaceSample[]>();
  private readonly roasts = new Map<string, Roast[]>();
  private readonly roastStates = new Map<string, RoastEvaluationState>();
  private readonly bets = new Map<string, Bet>();

  listSessions(): RunSession[] {
    return [...this.sessions.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getSession(id: string): RunSession | undefined {
    return this.sessions.get(id);
  }

  putSession(session: RunSession): RunSession {
    this.sessions.set(session.id, session);
    if (!this.roastStates.has(session.id)) this.roastStates.set(session.id, initialRoastState());
    return session;
  }

  roastState(sessionId: string): RoastEvaluationState {
    return this.roastStates.get(sessionId) ?? initialRoastState();
  }

  setRoastState(sessionId: string, state: RoastEvaluationState): void {
    this.roastStates.set(sessionId, state);
  }

  addSample(sample: PaceSample): PaceSample {
    const list = this.samples.get(sample.sessionId) ?? [];
    list.push(sample);
    this.samples.set(sample.sessionId, list);
    return sample;
  }

  listSamples(sessionId: string): PaceSample[] {
    return [...(this.samples.get(sessionId) ?? [])];
  }

  addRoast(roast: Roast): Roast {
    const list = this.roasts.get(roast.sessionId) ?? [];
    list.push(roast);
    this.roasts.set(roast.sessionId, list);
    return roast;
  }

  listRoasts(sessionId: string): Roast[] {
    return [...(this.roasts.get(sessionId) ?? [])].reverse();
  }

  listBets(): Bet[] {
    return [...this.bets.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getBet(id: string): Bet | undefined {
    return this.bets.get(id);
  }

  putBet(bet: Bet): Bet {
    this.bets.set(bet.id, bet);
    return bet;
  }

  reset(): void {
    this.sessions.clear();
    this.samples.clear();
    this.roasts.clear();
    this.roastStates.clear();
    this.bets.clear();
  }
}
