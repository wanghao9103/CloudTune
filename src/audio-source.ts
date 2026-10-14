/** Keep online audio in memory while bypassing WebKitGTK's Blob range loader. */
export function createCachedAudioSource(
  bytes: ArrayBuffer,
  type: string,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => {
      signal.removeEventListener("abort", cancel);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const cancel = () => {
      cleanup();
      reader.abort();
      reject(new DOMException("播放准备已取消", "AbortError"));
    };
    reader.onload = () => {
      const result = reader.result;
      cleanup();
      if (typeof result === "string") resolve(result);
      else reject(new Error("音频缓存未能读取，请重试。"));
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("音频缓存未能读取，请重试。"));
    };
    reader.onabort = cancel;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) return cancel();
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}
