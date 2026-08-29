import { formatPace } from '../../shared/pace.js';
import type { BetTarget, CoachMode, SponsorHook } from '../../shared/types.js';
import type { TargetResult } from './betEngine.js';

const ROASTS = [
  'Come on {runner}, {pace}? My grandmother power-walks to the bins faster than that.',
  '{runner}, you are {slowBy} percent off target. The pavement is falling asleep.',
  'Breaking news: {runner} has invented a new sport called standing still at {pace}.',
  '{runner}, your target was {target}. You are currently jogging at {pace}. Do the maths, then do the legs.',
  'I have seen glaciers with better splits, {runner}. {pace} is not a pace, it is a lifestyle choice.',
];

/**
 * Aggressive coach lines: shouted, confrontational, but always pointed at the
 * next step rather than at the runner as a person. Written for this app — no
 * real coach, athlete or public figure is quoted or impersonated.
 */
const DRILL_LINES = [
  '{runner}! {pace} is not the plan. The plan is {target}. Stop negotiating with yourself and MOVE.',
  'You are {slowBy} percent soft right now, {runner}. That voice asking to stop? Ignore it. One more kilometre. GO.',
  'Nobody is coming to carry you, {runner}. {pace} on the clock, {target} on the plan. Close that gap. NOW.',
  'This is the part you always quit, {runner}. Not today. Drive the knees, drive the arms, hold {target}. MOVE YOUR FEET.',
  'Comfortable at {pace}, are we? Comfortable is where progress dies, {runner}. Get after it. RIGHT NOW.',
  '{runner}, you asked for this. So earn it. Twenty hard seconds, then twenty more. NO EXCUSES, NO SLOWING DOWN.',
];

/** Voice-shaping hint the TTS layer maps to provider-specific settings. */
export type VoiceIntensity = 'normal' | 'aggressive';

export const intensityFor = (mode: CoachMode): VoiceIntensity =>
  mode === 'drill' ? 'aggressive' : 'normal';

export interface RoastCopyInput {
  runnerName: string;
  paceSecPerKm: number;
  targetPaceSecPerKm: number;
  slowByPct: number;
  sponsorHook: SponsorHook | null;
  /** Personality the line is written in (default `roast`). */
  coachMode?: CoachMode;
  /** Deterministic template selection for tests/demos. */
  seed?: number;
}

export function composeRoast(input: RoastCopyInput): string {
  const templates = input.coachMode === 'drill' ? DRILL_LINES : ROASTS;
  const index = (input.seed ?? Math.floor(Math.random() * templates.length)) % templates.length;
  const base = templates[index]
    .replaceAll('{runner}', input.runnerName)
    .replaceAll('{pace}', formatPace(input.paceSecPerKm))
    .replaceAll('{target}', formatPace(input.targetPaceSecPerKm))
    .replaceAll('{slowBy}', String(Math.max(1, Math.round(input.slowByPct * 100))));

  if (!input.sponsorHook) return base;
  if (input.coachMode === 'drill') {
    return `${base} ${input.sponsorHook.productPlug.toUpperCase()} ${input.sponsorHook.tagline}`;
  }
  return `${base} ${input.sponsorHook.productPlug} ${input.sponsorHook.tagline}`;
}

export function composeConfession(input: {
  runner: string;
  groupName: string;
  dare: string;
  stake: string;
  missed: TargetResult[];
  targets: BetTarget[];
}): string {
  const missedLabels = input.missed.map((m) => m.label).join(' and ');
  const detail = input.missed
    .map((m) => {
      const target = input.targets.find((t) => t.id === m.targetId);
      if (!target) return m.label;
      return target.kind === 'avg_pace'
        ? `${m.label}: I was ${Math.round(m.shortfall)} seconds per kilometre too slow`
        : `${m.label}: I came up ${m.shortfall.toFixed(2)} kilometres short`;
    })
    .join('. ');

  return (
    `Hello ${input.groupName}, this is ${input.runner} and I have a confession. ` +
    `I missed ${missedLabels}. ${detail}. ` +
    `As agreed, the stake was ${input.stake}, so I will now ${input.dare}. ` +
    `Please be gentle in the group chat. Actually, don't be.`
  );
}
