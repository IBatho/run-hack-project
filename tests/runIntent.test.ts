import { describe, expect, it } from 'vitest';
import { parseRunIntent, SUPPORTED_PHRASES } from '../src/server/domain/runIntent.js';

describe('run intent parsing', () => {
  it('recognises every advertised phrase', () => {
    expect(SUPPORTED_PHRASES.map((phrase) => parseRunIntent(phrase).intent)).toEqual([
      'start_run',
      'start_run',
      'start_run',
      'roast_now',
      'stop_run',
    ]);
  });

  it('reads pace and coach mode out of the phrase', () => {
    expect(parseRunIntent('coach me at 5:30 in drill mode')).toMatchObject({
      intent: 'start_run',
      targetPaceSecPerKm: 330,
      coachMode: 'drill',
    });
    expect(parseRunIntent('start my run at 4.45/km')).toMatchObject({ targetPaceSecPerKm: 285 });
  });

  it('picks up an explicit runner but never "me"', () => {
    expect(parseRunIntent('start coaching for Bex')).toMatchObject({
      intent: 'start_run',
      runnerName: 'Bex',
    });
    expect(parseRunIntent('start my run')?.runnerName).toBeUndefined();
  });

  it('prefers stop over start so a mixed sentence never starts a run', () => {
    expect(parseRunIntent('stop coaching and start walking').intent).toBe('stop_run');
    expect(parseRunIntent("i'm done").intent).toBe('stop_run');
  });

  it('returns unknown rather than guessing', () => {
    for (const text of ['', 'what is my pace', 'book me a table', 'run hack project']) {
      expect(parseRunIntent(text).intent).toBe('unknown');
    }
  });

  it('ignores case, curly apostrophes and extra whitespace', () => {
    expect(parseRunIntent('  START   My  Run  ').intent).toBe('start_run');
    expect(parseRunIntent('I’m done').intent).toBe('stop_run');
  });
});
