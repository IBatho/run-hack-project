/** Types shared between the API server and the web prototype UI. */

export type ProviderMode = 'live' | 'mock';

/**
 * Coaching personality used to compose and voice a roast.
 *
 * - `roast`: dry, sarcastic wind-up (the original prototype tone).
 * - `drill`: an original aggressive coach — shouted, relentless, motivational.
 *   It is a persona of this app, not an impression of any real person.
 */
export type CoachMode = 'roast' | 'drill';

export const COACH_MODES: readonly CoachMode[] = ['roast', 'drill'];

export const isCoachMode = (value: unknown): value is CoachMode =>
  typeof value === 'string' && (COACH_MODES as readonly string[]).includes(value);

/** A configured runner session that the Audio Roast Engine monitors. */
export interface RunSession {
  id: string;
  runnerName: string;
  /** Target pace in seconds per km. Slower (higher) pace than this may trigger a roast. */
  targetPaceSecPerKm: number;
  /** Fractional grace above target before a roast fires (0.05 = 5% slower is still fine). */
  tolerancePct: number;
  /** Consecutive slow samples required before firing (debounce). */
  debounceSamples: number;
  /** Minimum seconds between two roasts for this session. */
  cooldownSec: number;
  /** ElevenLabs voice id used for this session's roasts. */
  voiceId: string;
  /** Coaching personality applied to copy and voice settings. */
  coachMode: CoachMode;
  /** Whether Healf sponsor hooks are woven into roast copy. */
  sponsorEnabled: boolean;
  createdAt: string;
}

export interface PaceSample {
  id: string;
  sessionId: string;
  /** Current pace in seconds per km. */
  paceSecPerKm: number;
  distanceKm: number;
  /** Epoch millis of the sample. */
  at: number;
}

export type RoastTrigger = 'threshold' | 'manual' | 'bet_confession';

export interface AudioClip {
  id: string;
  url: string;
  mimeType: string;
  provider: ProviderMode;
  voiceId: string;
  durationMsEstimate: number;
}

export interface SponsorHook {
  sponsor: string;
  tagline: string;
  productPlug: string;
  ctaUrl: string;
  provider: ProviderMode;
}

export interface Roast {
  id: string;
  sessionId: string;
  trigger: RoastTrigger;
  /** Personality the copy and audio were generated with. */
  coachMode: CoachMode;
  text: string;
  paceSecPerKm: number | null;
  targetPaceSecPerKm: number;
  sponsorHook: SponsorHook | null;
  audio: AudioClip | null;
  audioError: string | null;
  createdAt: string;
}

export type BetTargetKind = 'avg_pace' | 'distance';

export interface BetTarget {
  id: string;
  label: string;
  kind: BetTargetKind;
  /** avg_pace: max allowed average sec/km. distance: min required km. */
  value: number;
}

export type BetStatus = 'open' | 'in_progress' | 'won' | 'missed';

export interface BetProgress {
  distanceKm: number;
  avgPaceSecPerKm: number;
  elapsedSec: number;
  at: number;
}

export interface BetConfession {
  id: string;
  text: string;
  audio: AudioClip | null;
  audioError: string | null;
  delivery: PokeDelivery | null;
  createdAt: string;
}

export interface Bet {
  id: string;
  creator: string;
  runner: string;
  groupId: string;
  groupName: string;
  dare: string;
  stake: string;
  targets: BetTarget[];
  status: BetStatus;
  /** Targets that have been detected as missed, by target id. */
  missedTargetIds: string[];
  progress: BetProgress | null;
  confession: BetConfession | null;
  voiceId: string;
  createdAt: string;
  settledAt: string | null;
}

export interface PokeDelivery {
  id: string;
  groupId: string;
  text: string;
  audioUrl: string | null;
  provider: ProviderMode;
  status: 'delivered' | 'failed';
  attempts: number;
  error: string | null;
  at: string;
}

export interface ProviderStatus {
  elevenlabs: ProviderMode;
  healf: ProviderMode;
  poke: ProviderMode;
  pokeAi: ProviderMode;
  strava: ProviderMode;
}

/** Where a completed run came from. */
export type ActivitySource = 'manual' | 'strava' | 'web' | 'poke';

/** A completed run that feeds the leaderboard. */
export interface RunActivity {
  id: string;
  /** Provider-side id (Strava activity id) used to de-duplicate imports. */
  externalId: string | null;
  source: ActivitySource;
  runnerName: string;
  /** Roast session this run was tracked under, when it came from a live session. */
  sessionId: string | null;
  name: string;
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  startedAt: string;
}

export type LeaderboardMetric = 'distance' | 'pace' | 'roasts';

export interface LeaderboardEntry {
  rank: number;
  runnerName: string;
  runCount: number;
  totalDistanceKm: number;
  /** Distance-weighted average pace across the runner's activities. */
  avgPaceSecPerKm: number | null;
  bestPaceSecPerKm: number | null;
  roastCount: number;
  betsWon: number;
  betsMissed: number;
  sources: ActivitySource[];
}

/** What prompted a coaching message to Poke. */
export type PokeCoachEvent = 'run_completed' | 'roast_fired' | 'digest';

/** Conversational command Poke recognised and handed to the app. */
export type RunCommandIntent = 'start_run' | 'stop_run' | 'roast_now';

/**
 * Lifecycle of a Poke-initiated run.
 *
 * `awaiting_gesture` is the important one: Poke can create the session and the
 * roast queue server-side, but browsers only start audio from a user gesture, so
 * the run is not truly live until the web app claims the command from a tap.
 */
export type RunCommandStatus = 'awaiting_gesture' | 'armed' | 'completed' | 'expired';

export interface RunCommand {
  id: string;
  intent: RunCommandIntent;
  status: RunCommandStatus;
  runnerName: string;
  /** Roast session the web app should track and voice. */
  sessionId: string;
  coachMode: CoachMode;
  targetPaceSecPerKm: number;
  /** What the runner typed in Poke. */
  requestText: string;
  /** Reply Poke should send back into the chat. */
  reply: string;
  /** Link the runner taps to arm audio and start tracking. */
  webAppUrl: string;
  source: 'poke_mcp' | 'poke_webhook';
  conversationId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  claimedAt: string | null;
  /** True once the browser confirmed Web Audio is actually running. */
  audioArmed: boolean;
  expiresAt: string;
}

/** One coaching message pushed to Poke (or recorded by the mock channel). */
export interface PokeCoachMessage {
  id: string;
  event: PokeCoachEvent;
  runnerName: string;
  /** Natural-language instruction Poke's agent acts on. */
  message: string;
  /** Structured run data forwarded alongside the instruction. */
  context: Record<string, unknown>;
  provider: ProviderMode;
  status: 'delivered' | 'failed';
  attempts: number;
  error: string | null;
  at: string;
}

export interface PokeStatus {
  mode: ProviderMode;
  /** Documented Poke inbound endpoint this build posts to (never the key). */
  endpoint: string;
  lastSyncAt: string | null;
  messagesSent: number;
  /** Path of the MCP server Poke can call to read runs and log new ones. */
  mcpPath: string;
  /** True when POKE_MCP_TOKEN is set and callers must send a bearer token. */
  mcpAuthRequired: boolean;
}

export interface StravaStatus {
  mode: ProviderMode;
  connected: boolean;
  athleteName: string | null;
  lastSyncAt: string | null;
  /** Null when the client id is missing, so the UI can explain what to configure. */
  authorizeUrl: string | null;
}
