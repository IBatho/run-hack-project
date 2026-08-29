/** Types shared between the API server and the web prototype UI. */

export type ProviderMode = 'live' | 'mock';

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
  strava: ProviderMode;
}

/** Where a completed run came from. */
export type ActivitySource = 'manual' | 'strava' | 'ios';

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

export interface StravaStatus {
  mode: ProviderMode;
  connected: boolean;
  athleteName: string | null;
  lastSyncAt: string | null;
  /** Null when the client id is missing, so the UI can explain what to configure. */
  authorizeUrl: string | null;
}
