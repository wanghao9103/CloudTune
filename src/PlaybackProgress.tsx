import { useSyncExternalStore } from "react";
import { time } from "./api";
import type { PlaybackViewStore } from "./playback-view";

export default function PlaybackProgress({
  clock,
  enabled,
  onSeek,
}: {
  clock: PlaybackViewStore;
  enabled: boolean;
  onSeek: (position: number) => void;
}) {
  const { position, duration } = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
  );
  return (
    <div className="progress">
      <span>{time(position)}</span>
      <input
        aria-label="播放进度"
        type="range"
        min="0"
        max={duration || 1}
        step="0.1"
        value={Math.min(position, duration || 1)}
        disabled={!enabled}
        style={
          {
            "--progress": `${duration ? Math.min(100, (position / duration) * 100) : 0}%`,
          } as React.CSSProperties
        }
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span>{time(duration)}</span>
    </div>
  );
}
