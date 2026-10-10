export type PlaybackSnapshot = {
  playing: boolean;
  buffering: boolean;
  recovering: boolean;
  position: number;
  duration: number;
};

export type PlaybackOptions = {
  onState: (state: PlaybackSnapshot) => void;
  onError: (message: string) => void;
  onEnded: () => void;
  now?: () => number;
  setInterval?: (callback: () => void, delay: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  watchdogIntervalMs?: number;
  recoveryTimeoutMs?: number;
  lifecycleTarget?: EventTarget;
  visibilityTarget?: EventTarget;
};

class PlaybackCanceled extends Error {}

/** Media state and clock progress cannot establish that the output device is audible. */
export function createPlaybackController(
  audio: HTMLAudioElement,
  options: PlaybackOptions,
) {
  const now = options.now ?? (() => performance.now());
  const repeat =
    options.setInterval ?? ((fn, delay) => globalThis.setInterval(fn, delay));
  const stopRepeat =
    options.clearInterval ?? ((id) => globalThis.clearInterval(id as number));
  const later =
    options.setTimeout ?? ((fn, delay) => globalThis.setTimeout(fn, delay));
  const stopLater =
    options.clearTimeout ?? ((id) => globalThis.clearTimeout(id as number));
  const timeout = options.recoveryTimeoutMs ?? 12000;
  let generation = 0;
  let disposed = false;
  let wantsPlay = false;
  let mediaPlaying = false;
  let buffering = false;
  let recovering = false;
  let expectedPauseEvents = 0;
  let autoRecoveries = 0;
  let pauseRecoveryUsed = false;
  let lastErrorGeneration = -1;
  let lastTime = audio.currentTime || 0;
  let lastProgressAt = now();
  let seekStartedAt: number | null = null;
  let refreshSource: (() => Promise<string>) | undefined;
  let pendingSeek: { generation: number; position: number } | null = null;
  let activeRecovery: Promise<void> | null = null;
  let startingGeneration: number | null = null;
  const cancellations = new Set<() => void>();
  const source = () => audio.getAttribute("src") || "";
  const current = (token: number) => !disposed && token === generation;
  const emit = () => {
    if (disposed) return;
    options.onState({
      playing:
        wantsPlay &&
        mediaPlaying &&
        !audio.paused &&
        !audio.ended &&
        !buffering &&
        !recovering,
      buffering,
      recovering,
      position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    });
  };
  const markProgress = () => {
    lastTime = audio.currentTime || 0;
    lastProgressAt = now();
  };
  const internalPause = () => {
    // pause events are queued by real media elements, so a synchronous flag is insufficient.
    if (!audio.paused) expectedPauseEvents++;
    audio.pause();
  };
  const invalidate = () => {
    generation++;
    for (const cancel of [...cancellations]) cancel();
    activeRecovery = null;
    startingGeneration = null;
    pendingSeek = null;
    seekStartedAt = null;
    recovering = false;
    return generation;
  };
  const fail = (token: number, message: string) => {
    if (!current(token) || lastErrorGeneration === token) return;
    lastErrorGeneration = token;
    wantsPlay = false;
    mediaPlaying = false;
    buffering = false;
    recovering = false;
    internalPause();
    emit();
    options.onError(message);
  };
  const guard = <T>(promise: Promise<T>, token: number): Promise<T> =>
    new Promise((resolve, reject) => {
      let complete = false;
      let timer: unknown;
      const finish = (error: unknown, value?: T) => {
        if (complete) return;
        complete = true;
        stopLater(timer);
        cancellations.delete(cancel);
        if (error) reject(error);
        else resolve(value as T);
      };
      const cancel = () => finish(new PlaybackCanceled());
      cancellations.add(cancel);
      timer = later(() => finish(new Error("音频启动超时")), timeout);
      promise.then(
        (value) => (current(token) ? finish(null, value) : cancel()),
        (error) => (current(token) ? finish(error) : cancel()),
      );
      if (!current(token)) cancel();
    });
  const applySeek = () => {
    if (
      !pendingSeek ||
      !current(pendingSeek.generation) ||
      audio.readyState < 1
    )
      return;
    const max = Number.isFinite(audio.duration)
      ? Math.max(0, audio.duration - 0.01)
      : Infinity;
    try {
      audio.currentTime = Math.min(pendingSeek.position, max);
      pendingSeek = null;
      markProgress();
    } catch {
      // Metadata/canplay will retry when the media timeline becomes available.
    }
  };
  const waitForMetadata = async (token: number) => {
    if (audio.readyState >= 1) return;
    let ready: () => void = () => {};
    let error: () => void = () => {};
    const metadata = new Promise<void>((resolve, reject) => {
      ready = () => resolve();
      error = () => reject(new Error("音频加载失败"));
      audio.addEventListener("loadedmetadata", ready);
      audio.addEventListener("error", error);
    });
    try {
      await guard(metadata, token);
    } finally {
      audio.removeEventListener("loadedmetadata", ready);
      audio.removeEventListener("error", error);
    }
  };
  const start = async (token: number) => {
    if (!current(token) || !wantsPlay) throw new PlaybackCanceled();
    startingGeneration = token;
    const promise = audio.play();
    // Some engines can finish an old play request after a deliberate pause.
    void promise.then(
      () => {
        if (disposed || !wantsPlay) internalPause();
      },
      () => {},
    );
    try {
      await guard(promise, token);
    } finally {
      if (startingGeneration === token) startingGeneration = null;
    }
    if (!current(token) || !wantsPlay) throw new PlaybackCanceled();
    mediaPlaying = !audio.paused && !audio.ended;
    buffering = false;
    markProgress();
    emit();
  };
  const waitForProgress = async (token: number, position: number) => {
    let cleanup: () => void = () => {};
    const progress = new Promise<void>((resolve, reject) => {
      const check = () => {
        if (audio.error) reject(new Error("音频加载失败"));
        else if (!audio.seeking && audio.currentTime - position >= 0.025)
          resolve();
      };
      audio.addEventListener("timeupdate", check);
      audio.addEventListener("seeked", check);
      audio.addEventListener("error", check);
      const timer = repeat(check, 100);
      cleanup = () => {
        stopRepeat(timer);
        audio.removeEventListener("timeupdate", check);
        audio.removeEventListener("seeked", check);
        audio.removeEventListener("error", check);
      };
      check();
    });
    try {
      await guard(progress, token);
    } finally {
      cleanup();
    }
  };
  const rebuild = (
    automatic: boolean,
    restorePosition = audio.currentTime,
  ): Promise<void> => {
    if (activeRecovery) return activeRecovery;
    const url = source();
    if (disposed || !url) return Promise.resolve();
    const shouldPlay = wantsPlay;
    const position = Number.isFinite(restorePosition) ? restorePosition : 0;
    const volume = audio.volume;
    const muted = audio.muted;
    const token = invalidate();
    wantsPlay = shouldPlay;
    recovering = true;
    mediaPlaying = false;
    buffering = shouldPlay;
    internalPause();
    markProgress();
    emit();
    const operation = (async () => {
      try {
        const replacement = refreshSource
          ? await guard(refreshSource(), token)
          : url;
        if (!current(token)) throw new PlaybackCanceled();
        if (!replacement) throw new Error("这首歌暂时无法播放");
        // Reload an authorized URL for the same track; local files keep their URL.
        audio.removeAttribute("src");
        audio.load();
        pendingSeek = { generation: token, position };
        audio.src = replacement;
        audio.load();
        audio.volume = volume;
        audio.muted = muted;
        await waitForMetadata(token);
        if (!current(token)) throw new PlaybackCanceled();
        applySeek();
        if (shouldPlay && wantsPlay) {
          const baseline = Number.isFinite(audio.duration)
            ? Math.min(position, Math.max(0, audio.duration - 0.01))
            : position;
          await start(token);
          // A resolved play promise alone can leave a stalled seek/stream frozen.
          await waitForProgress(token, baseline);
        } else internalPause();
        if (!current(token)) throw new PlaybackCanceled();
        recovering = false;
        buffering = false;
        emit();
      } catch (error) {
        if (error instanceof PlaybackCanceled || !current(token)) return;
        if (!automatic) fail(token, "音频恢复失败，请点击“恢复声音”重试。");
        throw error;
      } finally {
        if (current(token)) activeRecovery = null;
      }
    })();
    activeRecovery = operation;
    return operation;
  };
  const autoRecover = async () => {
    if (!wantsPlay || disposed || activeRecovery) return;
    const position = audio.currentTime;
    while (wantsPlay && !disposed && autoRecoveries < 2) {
      autoRecoveries++;
      try {
        await rebuild(true, position);
        return;
      } catch {
        if (!wantsPlay || disposed) return;
      }
    }
    if (wantsPlay && !disposed)
      fail(generation, "播放中断，自动恢复未成功，请点击“恢复声音”重试。");
  };
  const checkProgress = () => {
    if (!wantsPlay || disposed || recovering || !source()) return;
    if (audio.ended) {
      listeners.ended();
      return;
    }
    if (Math.abs(audio.currentTime - lastTime) >= 0.025) {
      markProgress();
      return;
    }
    if (now() - Math.max(lastProgressAt, seekStartedAt ?? 0) < 6000) return;
    // A progressing clock is deliberately never treated as proof of audible output.
    void autoRecover();
  };
  const listeners: Record<string, () => void> = {
    playing: () => {
      if (!wantsPlay) {
        internalPause();
        mediaPlaying = false;
      } else {
        mediaPlaying = true;
        buffering = false;
      }
      emit();
    },
    pause: () => {
      if (expectedPauseEvents) {
        expectedPauseEvents--;
        return;
      }
      mediaPlaying = false;
      emit();
      if (!wantsPlay || disposed || recovering || audio.ended || !source())
        return;
      if (pauseRecoveryUsed) {
        fail(generation, "播放再次中断，请点击“恢复声音”重试。");
        return;
      }
      pauseRecoveryUsed = true;
      void autoRecover();
    },
    waiting: () => {
      if (wantsPlay) {
        buffering = true;
        mediaPlaying = false;
        emit();
      }
    },
    stalled: () => {
      if (wantsPlay) {
        buffering = true;
        emit();
      }
    },
    canplay: () => {
      applySeek();
      if (!recovering) buffering = false;
      emit();
    },
    loadedmetadata: () => {
      applySeek();
      emit();
    },
    timeupdate: () => {
      if (Math.abs(audio.currentTime - lastTime) >= 0.025) {
        markProgress();
        if (
          !recovering &&
          wantsPlay &&
          !audio.paused &&
          !audio.seeking &&
          audio.readyState >= 3
        ) {
          buffering = false;
          mediaPlaying = true;
        }
      }
      emit();
    },
    seeking: () => {
      seekStartedAt ??= now();
      if (wantsPlay) buffering = true;
      emit();
    },
    seeked: () => {
      seekStartedAt = null;
      if (Math.abs(audio.currentTime - lastTime) >= 0.025) markProgress();
      if (!recovering && wantsPlay && !audio.paused && audio.readyState >= 3) {
        buffering = false;
        mediaPlaying = true;
      }
      emit();
    },
    emptied: () => {
      mediaPlaying = false;
      buffering = wantsPlay && !!source();
      emit();
    },
    error: () => {
      if (!source() || recovering) return;
      fail(generation, "音频加载失败，请检查网络或文件格式后重试。");
    },
    ended: () => {
      if (!wantsPlay || !audio.ended || !source()) return;
      wantsPlay = false;
      invalidate();
      mediaPlaying = false;
      buffering = false;
      emit();
      options.onEnded();
    },
  };
  for (const [event, listener] of Object.entries(listeners))
    audio.addEventListener(event, listener);
  const lifecycle =
    options.lifecycleTarget ??
    (typeof window === "undefined" ? undefined : window);
  const visibility =
    options.visibilityTarget ??
    (typeof document === "undefined" ? undefined : document);
  lifecycle?.addEventListener("focus", checkProgress);
  visibility?.addEventListener("visibilitychange", checkProgress);
  const watchdog = repeat(checkProgress, options.watchdogIntervalMs ?? 1000);
  emit();

  return {
    reset() {
      wantsPlay = false;
      invalidate();
      mediaPlaying = false;
      buffering = false;
      autoRecoveries = 0;
      pauseRecoveryUsed = false;
      refreshSource = undefined;
      internalPause();
      audio.removeAttribute("src");
      audio.load();
      markProgress();
      emit();
    },
    async playSource(url: string, resolveSource?: () => Promise<string>) {
      if (disposed) return;
      const token = invalidate();
      wantsPlay = true;
      mediaPlaying = false;
      buffering = true;
      autoRecoveries = 0;
      pauseRecoveryUsed = false;
      refreshSource = resolveSource;
      internalPause();
      audio.src = url;
      audio.load();
      markProgress();
      emit();
      try {
        await start(token);
      } catch (error) {
        if (error instanceof PlaybackCanceled || !current(token)) return;
        fail(token, "播放失败，请点击“恢复声音”或重新选择歌曲。");
        throw error;
      }
    },
    async resume() {
      if (disposed || !source()) return;
      if (
        wantsPlay &&
        (activeRecovery || startingGeneration === generation || !audio.paused)
      )
        return;
      const token = invalidate();
      wantsPlay = true;
      autoRecoveries = 0;
      pauseRecoveryUsed = false;
      buffering = true;
      markProgress();
      emit();
      try {
        await start(token);
      } catch (error) {
        if (error instanceof PlaybackCanceled || !current(token)) return;
        fail(token, "播放失败，请点击“恢复声音”重试。");
        throw error;
      }
    },
    pause() {
      wantsPlay = false;
      invalidate();
      mediaPlaying = false;
      buffering = false;
      internalPause();
      markProgress();
      emit();
    },
    recover() {
      autoRecoveries = 0;
      pauseRecoveryUsed = false;
      return rebuild(false);
    },
    seek(seconds: number) {
      if (disposed || !Number.isFinite(seconds) || !source()) return;
      pendingSeek = { generation, position: Math.max(0, seconds) };
      applySeek();
      markProgress();
      emit();
    },
    dispose() {
      if (disposed) return;
      wantsPlay = false;
      invalidate();
      disposed = true;
      internalPause();
      stopRepeat(watchdog);
      lifecycle?.removeEventListener("focus", checkProgress);
      visibility?.removeEventListener("visibilitychange", checkProgress);
      for (const [event, listener] of Object.entries(listeners))
        audio.removeEventListener(event, listener);
    },
  };
}

export type PlaybackController = ReturnType<typeof createPlaybackController>;
