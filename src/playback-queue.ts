/** A failure chain visits each track at most once, even in repeat-one mode. */
export function createQueueFailurePolicy() {
  const failed = new Set<number>();
  return {
    reset() {
      failed.clear();
    },
    next<T extends { id: number }>(
      queue: T[],
      currentId: number,
      shuffle: boolean,
    ) {
      failed.add(currentId);
      const current = queue.findIndex((track) => track.id === currentId);
      const candidates = Array.from(
        { length: queue.length },
        (_, offset) =>
          queue[(current + offset + 1 + queue.length) % queue.length],
      ).filter((track) => !failed.has(track.id));
      if (!candidates.length) return undefined;
      return candidates[
        shuffle ? Math.floor(Math.random() * candidates.length) : 0
      ];
    },
  };
}
