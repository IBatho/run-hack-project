import { formatPace } from '../../shared/pace.js';
import type { BetTarget, SponsorHook } from '../../shared/types.js';
import type { TargetResult } from './betEngine.js';

const ROASTS = [
  'Come on {runner}, {pace}? My grandmother power-walks to the bins faster than that.',
  '{runner}, you are {slowBy} percent off target. The pavement is falling asleep.',
  'Breaking news: {runner} has invented a new sport called standing still at {pace}.',
  '{runner}, your target was {target}. You are currently jogging at {pace}. Do the maths, then do the legs.',
  'I have seen glaciers with better splits, {runner}. {pace} is not a pace, it is a lifestyle choice.',
];

export interface RoastCopyInput {
  runnerName: string;
  paceSecPerKm: number;
  targetPaceSecPerKm: number;
  slowByPct: number;
  sponsorHook: SponsorHook | null;
  /** Deterministic template selection for tests/demos. */
  seed?: number;
}

export function composeRoast(input: RoastCopyInput): string {
  const index = (input.seed ?? Math.floor(Math.random() * ROASTS.length)) % ROASTS.length;
  const base = ROASTS[index]
    .replaceAll('{runner}', input.runnerName)
    .replaceAll('{pace}', formatPace(input.paceSecPerKm))
    .replaceAll('{target}', formatPace(input.targetPaceSecPerKm))
    .replaceAll('{slowBy}', String(Math.max(1, Math.round(input.slowByPct * 100))));

  if (!input.sponsorHook) return base;
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
