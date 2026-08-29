import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip } from '../src/shared/types.js';
import { shouldSpeakLocally, speakText, speechSupported } from '../src/web/tracking/audioCues.js';

const clip = (provider: AudioClip['provider']): AudioClip => ({
  id: 'clip-1',
  url: '/api/audio/clip-1.wav',
  mimeType: 'audio/wav',
  provider,
  voiceId: 'voice',
  durationMsEstimate: 1200,
});

class FakeUtterance {
  rate = 1;
  constructor(readonly text: string) {}
}

const installSpeech = () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal('window', { speechSynthesis: { speak, cancel } });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { speak, cancel };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldSpeakLocally', () => {
  it('plays back only live provider clips', () => {
    expect(shouldSpeakLocally(clip('live'))).toBe(false);
    expect(shouldSpeakLocally(clip('mock'))).toBe(true);
    expect(shouldSpeakLocally(null)).toBe(true);
    expect(shouldSpeakLocally(undefined)).toBe(true);
  });
});

describe('speakText', () => {
  it('cancels any queued utterance and speaks the roast', () => {
    const { speak, cancel } = installSpeech();
    expect(speakText('You are being outrun by a postbox')).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('You are being outrun by a postbox');
    expect(utterance.rate).toBeCloseTo(1.05);
  });

  it('reports unsupported when the browser has no synthesiser', () => {
    vi.stubGlobal('window', {});
    expect(speechSupported()).toBe(false);
    expect(speakText('silence')).toBe(false);
  });
});
