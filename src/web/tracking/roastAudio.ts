/**
 * Roast audio session: the queue that plays coach roasts through the runner's
 * headphones while a run is in progress.
 *
 * Roasts arrive whenever the pace sampler (or Poke) fires one, which can happen
 * while an earlier clip is still playing, so playback is serialised through a
 * queue instead of layering `Audio` elements on top of each other. Everything
 * the UI needs is exposed as an immutable snapshot plus a subscription, and all
 * browser audio lives behind `RoastAudioPlayer` so the queue is testable in node.
 *
 * Browser rules this encodes:
 * - audio can only start from a user gesture, so `arm()` is called from the
 *   Start-run click and the queue reports `blocked` until it succeeds;
 * - a context can be suspended again by the OS, so `arm()` is re-run on
 *   visibility/focus changes and after each clip the state is re-read;
 * - a roast older than `staleAfterMs` is dropped rather than played late — being
 *   shouted at about a kilometre you already finished is worse than silence.
 */

import type { RoastAudioPlayer } from './audioCues.js';

export interface QueuedRoast {
  id: string;
  text: string;
  /** Same-origin clip path, or null when synthesis failed server-side. */
  clipUrl: string | null;
  /** Epoch ms the roast was created; used to drop stale clips. */
  at?: number;
}

export type RoastAudioState = 'unsupported' | 'idle' | 'blocked' | 'armed' | 'playing';

export interface RoastAudioSnapshot {
  state: RoastAudioState;
  muted: boolean;
  volume: number;
  /** Roast currently coming through the headphones. */
  playing: QueuedRoast | null;
  queued: number;
  played: number;
  /** Roasts dropped while muted, stale, or pushed out of a full queue. */
  dropped: number;
  /** Times the clip failed and the browser voice read the text instead. */
  spoken: number;
  lastError: string | null;
}

export interface RoastAudioOptions {
  /** Pending roasts kept before the oldest is dropped. */
  maxQueue?: number;
  /** Roasts older than this are dropped instead of played late. */
  staleAfterMs?: number;
  now?: () => number;
}

const DEFAULTS = { maxQueue: 3, staleAfterMs: 120_000 };

export class RoastAudioSession {
  private readonly queue: QueuedRoast[] = [];
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<(snapshot: RoastAudioSnapshot) => void>();
  private readonly maxQueue: number;
  private readonly staleAfterMs: number;
  private readonly now: () => number;

  private playing: QueuedRoast | null = null;
  private pumping = false;
  private armed = false;
  private muted = false;
  private volume = 0.9;
  private played = 0;
  private dropped = 0;
  private spoken = 0;
  private lastError: string | null = null;

  constructor(
    private readonly player: RoastAudioPlayer,
    options: RoastAudioOptions = {},
  ) {
    this.maxQueue = options.maxQueue ?? DEFAULTS.maxQueue;
    this.staleAfterMs = options.staleAfterMs ?? DEFAULTS.staleAfterMs;
    this.now = options.now ?? (() => Date.now());
  }

  snapshot(): RoastAudioSnapshot {
    return {
      state: this.state(),
      muted: this.muted,
      volume: this.volume,
      playing: this.playing,
      queued: this.queue.length,
      played: this.played,
      dropped: this.dropped,
      spoken: this.spoken,
      lastError: this.lastError,
    };
  }

  subscribe(listener: (snapshot: RoastAudioSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Starts (or resumes) audio output. Must be called from a user gesture the
   * first time; calling it again later — after a tab switch or a screen lock —
   * is free and resumes a context the OS suspended.
   */
  async arm(): Promise<boolean> {
    if (!this.player.supported) {
      this.lastError = 'This browser has no Web Audio support, so roasts cannot be played.';
      this.emit();
      return false;
    }
    let ok = false;
    try {
      ok = await this.player.unlock();
    } catch (error) {
      this.lastError = (error as Error).message;
    }
    this.armed = ok;
    if (ok) {
      this.lastError = null;
      this.player.setVolume(this.muted ? 0 : this.volume);
    } else if (!this.lastError) {
      this.lastError = 'Audio is blocked until you tap "Start run" (or the arm-audio button).';
    }
    this.emit();
    void this.pump();
    return ok;
  }

  /** Plays a short non-voice cue; never blocks the roast queue. */
  cue(name: 'start' | 'finish' | 'slow'): void {
    if (!this.armed || this.muted) return;
    this.player.cue(name);
  }

  /** Queues a roast. Returns false when it was ignored (duplicate, muted, stale). */
  enqueue(roast: QueuedRoast): boolean {
    if (this.seen.has(roast.id)) return false;
    this.seen.add(roast.id);

    if (this.muted) {
      this.dropped += 1;
      this.emit();
      return false;
    }
    if (this.isStale(roast)) {
      this.dropped += 1;
      this.lastError = 'Dropped a roast that arrived too late to be useful.';
      this.emit();
      return false;
    }

    this.queue.push(roast);
    while (this.queue.length > this.maxQueue) {
      this.queue.shift();
      this.dropped += 1;
    }
    this.emit();
    void this.pump();
    return true;
  }

  /** Stops the current roast and moves to the next one. */
  skip(): void {
    if (this.playing) {
      this.player.stop();
      return;
    }
    if (this.queue.shift()) {
      this.dropped += 1;
      this.emit();
    }
  }

  /** Drops everything pending; the run keeps going, the coach shuts up. */
  clear(): void {
    this.dropped += this.queue.length;
    this.queue.length = 0;
    if (this.playing) this.player.stop();
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.player.setVolume(muted ? 0 : this.volume);
    if (muted) this.clear();
    else this.emit();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (!this.muted) this.player.setVolume(this.volume);
    this.emit();
  }

  /** Called when the run ends: stop playback and forget pending roasts. */
  stop(): void {
    this.queue.length = 0;
    this.player.stop();
    this.playing = null;
    this.emit();
  }

  private state(): RoastAudioState {
    if (!this.player.supported) return 'unsupported';
    if (this.playing) return 'playing';
    if (!this.armed) return this.lastError ? 'blocked' : 'idle';
    return 'armed';
  }

  private isStale(roast: QueuedRoast): boolean {
    return roast.at !== undefined && this.now() - roast.at > this.staleAfterMs;
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.armed || this.muted) return;
    this.pumping = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) {
        if (this.isStale(next)) {
          this.dropped += 1;
          continue;
        }
        this.playing = next;
        this.emit();
        await this.playOne(next);
        this.playing = null;
        this.played += 1;
        this.armed = this.player.running;
        if (!this.armed) {
          this.lastError = 'The browser suspended audio — tap “Allow audio” to bring the coach back.';
        }
        this.emit();
        if (this.muted || !this.armed) break;
      }
    } finally {
      this.pumping = false;
      this.emit();
    }
  }

  /** Clip first; the browser voice reads the text when the clip is unusable. */
  private async playOne(roast: QueuedRoast): Promise<void> {
    if (roast.clipUrl) {
      try {
        await this.player.playClip(roast.clipUrl);
        this.lastError = null;
        return;
      } catch (error) {
        this.lastError = `Clip failed (${(error as Error).message}) — reading the roast instead.`;
      }
    }
    try {
      await this.player.speak(roast.text);
      this.spoken += 1;
    } catch (error) {
      this.lastError = `No audio for this roast: ${(error as Error).message}`;
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
