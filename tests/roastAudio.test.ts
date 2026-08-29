import { describe, expect, it, vi } from 'vitest';
import type { RoastAudioPlayer } from '../src/web/tracking/audioCues.js';
import { RoastAudioSession, type QueuedRoast } from '../src/web/tracking/roastAudio.js';

/** Stand-in for Web Audio: records calls and lets a test resolve playback by hand. */
class FakePlayer implements RoastAudioPlayer {
  supported = true;
  running = false;
  unlockResult = true;
  clipFails = false;
  speakFails = false;
  readonly clips: string[] = [];
  readonly spoken: string[] = [];
  readonly cues: string[] = [];
  volume = 0;
  private release: (() => void) | null = null;

  async unlock(): Promise<boolean> {
    this.running = this.unlockResult;
    return this.unlockResult;
  }

  playClip(url: string): Promise<void> {
    this.clips.push(url);
    if (this.clipFails) return Promise.reject(new Error('decode failed'));
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async speak(text: string): Promise<void> {
    this.spoken.push(text);
    if (this.speakFails) throw new Error('no speech synthesis');
  }

  cue(name: string): void {
    this.cues.push(name);
  }

  setVolume(value: number): void {
    this.volume = value;
  }

  stop(): void {
    this.finish();
  }

  /** Ends the clip that is currently playing. */
  finish(): void {
    const release = this.release;
    this.release = null;
    release?.();
  }
}

const roast = (id: string, over: Partial<QueuedRoast> = {}): QueuedRoast => ({
  id,
  text: `roast ${id}`,
  clipUrl: `/api/audio/${id}.wav`,
  ...over,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('roast audio queue', () => {
  it('stays blocked until armed, then plays what was waiting', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);

    session.enqueue(roast('a'));
    expect(player.clips).toEqual([]);
    expect(session.snapshot()).toMatchObject({ state: 'idle', queued: 1 });

    expect(await session.arm()).toBe(true);
    await settle();
    expect(player.clips).toEqual(['/api/audio/a.wav']);
    expect(session.snapshot()).toMatchObject({ state: 'playing', queued: 0 });

    player.finish();
    await settle();
    expect(session.snapshot()).toMatchObject({ state: 'armed', played: 1, playing: null });
  });

  it('reports blocked when the browser refuses to unlock audio', async () => {
    const player = new FakePlayer();
    player.unlockResult = false;
    const session = new RoastAudioSession(player);

    expect(await session.arm()).toBe(false);
    expect(session.snapshot().state).toBe('blocked');
    expect(session.snapshot().lastError).toMatch(/tap/i);
  });

  it('serialises playback instead of overlapping roasts', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a'));
    session.enqueue(roast('b'));
    await settle();
    expect(player.clips).toEqual(['/api/audio/a.wav']);
    expect(session.snapshot().queued).toBe(1);

    player.finish();
    await settle();
    expect(player.clips).toEqual(['/api/audio/a.wav', '/api/audio/b.wav']);
  });

  it('ignores duplicates and drops the oldest when the queue overflows', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player, { maxQueue: 1 });
    await session.arm();

    session.enqueue(roast('a'));
    await settle();
    expect(session.enqueue(roast('a'))).toBe(false);

    session.enqueue(roast('b'));
    session.enqueue(roast('c'));
    expect(session.snapshot()).toMatchObject({ queued: 1, dropped: 1 });

    player.finish();
    await settle();
    expect(player.clips).toEqual(['/api/audio/a.wav', '/api/audio/c.wav']);
  });

  it('drops roasts that arrived too late to be useful', async () => {
    const player = new FakePlayer();
    const now = vi.fn(() => 200_000);
    const session = new RoastAudioSession(player, { staleAfterMs: 1_000, now });
    await session.arm();

    expect(session.enqueue(roast('old', { at: 100_000 }))).toBe(false);
    await settle();
    expect(player.clips).toEqual([]);
    expect(session.snapshot()).toMatchObject({ dropped: 1 });
  });

  it('reads the roast aloud when the clip is missing or unusable', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a', { clipUrl: null }));
    await settle();
    expect(player.spoken).toEqual(['roast a']);
    expect(session.snapshot()).toMatchObject({ spoken: 1, played: 1 });

    player.clipFails = true;
    session.enqueue(roast('b'));
    await settle();
    expect(player.spoken).toEqual(['roast a', 'roast b']);
    expect(session.snapshot().lastError).toMatch(/decode failed/);
  });

  it('surfaces an error when neither the clip nor the voice works', async () => {
    const player = new FakePlayer();
    player.clipFails = true;
    player.speakFails = true;
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a'));
    await settle();
    expect(session.snapshot().lastError).toMatch(/no speech synthesis/);
  });

  it('mute silences the coach and clears what is pending', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a'));
    await settle();
    session.setMuted(true);
    expect(player.volume).toBe(0);
    expect(session.enqueue(roast('b'))).toBe(false);

    session.setVolume(0.5);
    expect(player.volume).toBe(0);
    session.setMuted(false);
    expect(player.volume).toBe(0.5);
  });

  it('skip ends the current roast and moves on', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a'));
    session.enqueue(roast('b'));
    await settle();
    session.skip();
    await settle();
    expect(player.clips).toEqual(['/api/audio/a.wav', '/api/audio/b.wav']);
  });

  it('goes back to blocked when the context is suspended mid-run', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    await session.arm();

    session.enqueue(roast('a'));
    session.enqueue(roast('b'));
    await settle();
    player.running = false;
    player.finish();
    await settle();

    expect(session.snapshot()).toMatchObject({ state: 'blocked', queued: 1 });
    expect(session.snapshot().lastError).toMatch(/suspended/i);
    expect(player.clips).toEqual(['/api/audio/a.wav']);
  });

  it('reports unsupported browsers instead of throwing', async () => {
    const player = new FakePlayer();
    player.supported = false;
    const session = new RoastAudioSession(player);

    expect(await session.arm()).toBe(false);
    expect(session.snapshot().state).toBe('unsupported');
  });

  it('notifies subscribers and stops on demand', async () => {
    const player = new FakePlayer();
    const session = new RoastAudioSession(player);
    const seen: string[] = [];
    const unsubscribe = session.subscribe((snapshot) => seen.push(snapshot.state));

    await session.arm();
    session.enqueue(roast('a'));
    await settle();
    session.stop();
    expect(seen).toContain('playing');
    expect(session.snapshot()).toMatchObject({ playing: null, queued: 0 });

    unsubscribe();
    session.setVolume(0.1);
    const before = seen.length;
    expect(seen.length).toBe(before);
  });
});
