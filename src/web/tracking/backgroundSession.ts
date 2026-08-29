/**
 * Keeping a run alive while the phone is in the runner's pocket.
 *
 * Two independent browser APIs, both optional and both no-ops where missing:
 * - Screen Wake Lock stops the page being frozen when the screen would sleep,
 *   which is what otherwise starves the geolocation watcher;
 * - Media Session puts the coach on the lock screen so skip/mute work without
 *   unlocking the phone.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

export interface WakeLockHandle {
  /** Re-acquires the lock; browsers drop it whenever the page is hidden. */
  reacquire(): Promise<void>;
  release(): Promise<void>;
}

/** Returns null when the browser has no Wake Lock API or refuses the request. */
export async function requestWakeLock(): Promise<WakeLockHandle | null> {
  const api = (navigator as Navigator & WakeLockNavigator).wakeLock;
  if (!api) return null;

  let sentinel: WakeLockSentinelLike | null = null;
  const acquire = async (): Promise<void> => {
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await api.request('screen');
    } catch {
      sentinel = null;
    }
  };

  await acquire();
  if (!sentinel) return null;

  return {
    reacquire: acquire,
    release: async () => {
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) await current.release().catch(() => undefined);
    },
  };
}

export interface MediaSessionControls {
  title: string;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
}

/** Publishes lock-screen controls. Returns a teardown function. */
export function bindMediaSession(controls: MediaSessionControls): () => void {
  const media = navigator.mediaSession;
  if (!media) return () => undefined;

  media.metadata = new MediaMetadata({
    title: controls.title,
    artist: 'Run Hack coach',
    album: 'Audio Roast Engine',
  });
  media.playbackState = 'playing';

  const handlers: Array<[MediaSessionAction, () => void]> = [
    ['nexttrack', controls.onSkip],
    ['pause', controls.onPause],
    ['play', controls.onResume],
    ['stop', controls.onPause],
  ];
  handlers.forEach(([action, handler]) => {
    try {
      media.setActionHandler(action, handler);
    } catch {
      // Unsupported action on this browser; the others still bind.
    }
  });

  return () => {
    handlers.forEach(([action]) => {
      try {
        media.setActionHandler(action, null);
      } catch {
        // Nothing to unbind.
      }
    });
    media.playbackState = 'none';
    media.metadata = null;
  };
}
