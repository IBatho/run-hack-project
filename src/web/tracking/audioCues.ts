/**
 * Web Audio playback for the browser tracker.
 *
 * Everything goes through one `AudioContext` created on a user gesture, because
 * mobile Safari/Chrome refuse to start audio otherwise — `unlock()` must be called
 * from the click handler that starts the run, not from an effect.
 *
 * Roast clips (`/api/audio/:id.wav`) are decoded and played through a gain node;
 * short oscillator cues cover start/finish and pace warnings so the runner gets
 * feedback even when the voice provider is unavailable. An inaudible looping
 * buffer keeps the audio session alive while the runner's phone is locked and the
 * page is in the background, which is the only state that matters during a run.
 */

export type CueName = 'start' | 'finish' | 'slow';

const CUES: Record<CueName, { frequencies: number[]; stepSec: number }> = {
  start: { frequencies: [660, 880], stepSec: 0.12 },
  finish: { frequencies: [880, 660, 440], stepSec: 0.14 },
  slow: { frequencies: [320, 240], stepSec: 0.18 },
};

/** Audible-clip playback surface the roast queue drives; faked in tests. */
export interface RoastAudioPlayer {
  readonly supported: boolean;
  /** Resolves true once the output is running. Call from a user gesture. */
  unlock(): Promise<boolean>;
  /** True while the output is running and can play without another gesture. */
  readonly running: boolean;
  /** Resolves when the clip has finished (or was stopped). */
  playClip(url: string): Promise<void>;
  /** Text-to-speech fallback; resolves when the utterance ends. */
  speak(text: string): Promise<void>;
  cue(name: CueName): void;
  setVolume(value: number): void;
  /** Stops whatever is playing now; the queue moves on. */
  stop(): void;
}

export class AudioCues implements RoastAudioPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private keepAlive: AudioBufferSourceNode | null = null;
  private current: AudioBufferSourceNode | null = null;
  private volume = 0.9;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<boolean> {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.context = new Ctor();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }
    this.startKeepAlive();
    return this.context.state === 'running';
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AudioContext);
  }

  get running(): boolean {
    return this.context?.state === 'running';
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.gain) this.gain.gain.value = this.volume;
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

  /** Fetches and plays a roast clip; resolves when playback ends. */
  async playClip(url: string): Promise<void> {
    if (!(await this.unlock())) throw new Error('audio output is not running');
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain) throw new Error('no audio output');

    const response = await fetch(url);
    if (!response.ok) throw new Error(`audio fetch failed (${response.status})`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());

    await new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => {
        if (this.current === source) this.current = null;
        resolve();
      };
      this.current = source;
      source.start();
    });
  }

  /**
   * Speaks the roast text. Used when a clip is unavailable (voice provider down),
   * and it costs nothing — the browser's own speech synthesiser, no API key.
   */
  async speak(text: string): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('speech synthesis unavailable');
    }
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.volume = this.volume;
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error('speech synthesis failed'));
      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (this.current) {
      try {
        this.current.stop();
      } catch {
        // Already finished; onended has resolved the playback promise.
      }
      this.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /**
   * A looping near-silent buffer. Without an active source, iOS suspends the
   * context a few seconds after the screen locks and later clips never play.
   */
  private startKeepAlive(): void {
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain || this.keepAlive) return;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.sin((i / context.sampleRate) * 2 * Math.PI * 40);
    const source = context.createBufferSource();
    const silence = context.createGain();
    silence.gain.value = 0.0002;
    source.buffer = buffer;
    source.loop = true;
    source.connect(silence).connect(context.destination);
    source.start();
    this.keepAlive = source;
  }
}
