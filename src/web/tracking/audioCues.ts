/**
 * Web Audio playback for the browser tracker.
 *
 * Everything goes through one `AudioContext` created on a user gesture, because
 * mobile Safari/Chrome refuse to start audio otherwise — `unlock()` must be called
 * from the click handler that starts the run, not from an effect.
 *
 * Roast clips (`/api/audio/:id.wav`) are decoded and played through a gain node;
 * short oscillator cues cover start/finish and pace warnings so the runner gets
 * feedback even when the voice provider is unavailable.
 */

type CueName = 'start' | 'finish' | 'slow';

const CUES: Record<CueName, { frequencies: number[]; stepSec: number }> = {
  start: { frequencies: [660, 880], stepSec: 0.12 },
  finish: { frequencies: [880, 660, 440], stepSec: 0.14 },
  slow: { frequencies: [320, 240], stepSec: 0.18 },
};

export class AudioCues {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0.9;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AudioContext);
  }

  cue(name: CueName): void {
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain) return;

    const { frequencies, stepSec } = CUES[name];
    frequencies.forEach((frequency, index) => {
      const at = context.currentTime + index * stepSec;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + stepSec);
      oscillator.connect(envelope).connect(gain);
      oscillator.start(at);
      oscillator.stop(at + stepSec);
    });
  }

  /** Fetches and plays a roast clip; resolves once playback has been scheduled. */
  async playClip(url: string): Promise<void> {
    await this.unlock();
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain) return;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`audio fetch failed (${response.status})`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  }

  /**
   * Speaks the roast text. Used when a clip is unavailable (voice provider down),
   * and it costs nothing — the browser's own speech synthesiser, no API key.
   */
  speak(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}
