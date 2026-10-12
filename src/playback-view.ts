export type PlaybackTime = Readonly<{ position: number; duration: number }>;

/** A display-only clock. Playback decisions always use the media element directly. */
export function createPlaybackViewStore() {
  let snapshot: PlaybackTime = { position: 0, duration: 0 };
  let visible = true;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(position: number, duration = snapshot.duration) {
      const nextPosition = Number.isFinite(position)
        ? Math.max(0, position)
        : 0;
      const nextDuration = Number.isFinite(duration)
        ? Math.max(0, duration)
        : snapshot.duration;
      if (
        snapshot.position === nextPosition &&
        snapshot.duration === nextDuration
      )
        return;
      snapshot = { position: nextPosition, duration: nextDuration };
      if (visible) notify();
    },
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      if (visible) notify();
    },
  };
}

export type PlaybackViewStore = ReturnType<typeof createPlaybackViewStore>;

export function activeLyricIndex(
  lines: readonly { time: number }[],
  position: number,
) {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= position) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
