/**
 * Natural-language intent parsing for the conversational entry point.
 *
 * Poke sends whatever the runner typed ("start my run", "coach me at 5:30 in
 * drill mode", "stop coaching"). Recognition is deliberately a small, pure,
 * deterministic matcher rather than a model call: it is the thing the API
 * contract promises, it must behave identically in tests and in the demo, and a
 * misread "stop" is worse than an unrecognised one.
 */

import { parsePace } from '../../shared/pace.js';
import type { CoachMode } from '../../shared/types.js';

export type RunIntentName = 'start_run' | 'stop_run' | 'roast_now' | 'unknown';

export interface RunIntent {
  intent: RunIntentName;
  /** Runner named in the phrase ("start Isaac's run"), when present. */
  runnerName?: string;
  /** Target pace parsed from "at 5:30" / "at 5:30/km". */
  targetPaceSecPerKm?: number;
  coachMode?: CoachMode;
  /** The normalised text the matcher actually looked at. */
  normalized: string;
}

const START = [
  /\bstart\b.*\b(run|running|jog|jogging|coach|coaching|workout|session|track|tracking)\b/,
  /\b(begin|kick ?off|fire up|let'?s go)\b.*\b(run|running|coach|coaching|workout|session)\b/,
  /\bcoach me\b/,
  /\bstart me\b/,
  /\b(i'?m|im|about to|going to|gonna)\s+(heading out|going out|starting|off)\b.*\b(run|running)\b/,
  /\bgo for a run\b/,
];

const STOP = [
  /\b(stop|end|finish|done with|cancel|pause)\b.*\b(run|running|coach|coaching|workout|session|tracking)\b/,
  /\b(i'?m|im)\s+(done|finished)\b/,
  /\bshut up\b/,
];

const ROAST = [/\broast me\b/, /\b(drill|yell at) me\b/, /\bmotivate me\b/];

/** "at 5:30", "at 5:30/km", "at 5.30 pace" — minutes:seconds per km only. */
const PACE = /\bat\s+(\d{1,2})[:.](\d{2})\s*(?:\/\s*km|per\s+km|pace|km)?\b/;
const RUNNER = /\bfor\s+([a-z][a-z' -]{1,30}?)\b(?=\s*(?:$|,|\.|at\b|in\b|please\b|now\b))/;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const matches = (patterns: RegExp[], text: string): boolean => patterns.some((pattern) => pattern.test(text));

const coachModeIn = (text: string): CoachMode | undefined => {
  if (/\b(drill|aggressive|shout|sergeant|goggins[- ]?style|hard mode)\b/.test(text)) return 'drill';
  if (/\b(roast|sarcastic|dry|gentle)\b/.test(text)) return 'roast';
  return undefined;
};

const runnerIn = (text: string): string | undefined => {
  const match = RUNNER.exec(text);
  if (!match) return undefined;
  const name = match[1].trim();
  if (!name || /\b(me|us|my run|the run|today|tomorrow)\b/.test(name)) return undefined;
  return name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

const paceIn = (text: string): number | undefined => {
  const match = PACE.exec(text);
  if (!match) return undefined;
  const seconds = parsePace(`${match[1]}:${match[2]}`);
  return seconds > 0 ? seconds : undefined;
};

/**
 * Classifies one chat message. `unknown` is returned for anything ambiguous so
 * the caller can answer with the supported phrasings instead of guessing.
 */
export function parseRunIntent(text: string): RunIntent {
  const normalized = normalize(text ?? '');
  const base: RunIntent = { intent: 'unknown', normalized };
  if (!normalized) return base;

  const detail: Omit<RunIntent, 'intent' | 'normalized'> = {
    runnerName: runnerIn(normalized),
    targetPaceSecPerKm: paceIn(normalized),
    coachMode: coachModeIn(normalized),
  };

  // Stop wins over start: "stop coaching and start walking" must not start a run.
  if (matches(STOP, normalized)) return { ...base, ...detail, intent: 'stop_run' };
  if (matches(START, normalized)) return { ...base, ...detail, intent: 'start_run' };
  if (matches(ROAST, normalized)) return { ...base, ...detail, intent: 'roast_now' };
  return { ...base, ...detail };
}

/** Phrasings advertised to Poke (and to the runner) as guaranteed to work. */
export const SUPPORTED_PHRASES = [
  'start my run',
  'start coaching',
  'coach me at 5:30 in drill mode',
  'roast me',
  'stop my run',
] as const;
