import { invoke, isTauri } from "@tauri-apps/api/core";
export const desktop = isTauri();
export async function api<T = any>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const result = desktop
    ? await invoke<T>("music_request", { action, params }).catch(
        (error: unknown) => {
          throw error instanceof Error
            ? error
            : new Error(typeof error === "string" ? error : "桌面接口调用失败");
        },
      )
    : await fetch("/music-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params }),
      }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.message || "连接失败");
        return data;
      });
  const data = result as any;
  if (data.code && ![200, 800, 801, 802, 803].includes(data.code))
    throw Error(data.message || data.msg || `网易云返回 ${data.code}`);
  return result;
}
export type Track = {
  id: number;
  name: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  fee?: number;
  localUrl?: string;
};
export type Playlist = {
  id: number;
  name: string;
  cover: string;
  count: number;
  description?: string;
  creator?: string;
  trackCount?: number;
  trackIds?: { id: number }[];
};
export function https(url: string = "") {
  return url.replace(/^http:/, "https:");
}
export function track(t: any): Track {
  return {
    id: t.id,
    name: t.name,
    artist: (t.ar || t.artists || []).map((a: any) => a.name).join(" / "),
    album: (t.al || t.album)?.name || "",
    cover: https((t.al || t.album)?.picUrl),
    duration: (t.dt || t.duration || 0) / 1000,
    fee: t.fee,
  };
}
export function playlist(p: any): Playlist {
  return {
    id: p.id,
    name: p.name,
    cover: https(p.picUrl || p.coverImgUrl),
    count: p.playCount || 0,
    description: p.description,
    creator: p.creator?.nickname,
    trackCount: p.trackCount,
    trackIds: p.trackIds,
  };
}
export function time(s: number) {
  if (!Number.isFinite(s)) s = 0;
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function count(n: number) {
  return n >= 100000000
    ? `${(n / 100000000).toFixed(1)}亿`
    : n >= 10000
      ? `${(n / 10000).toFixed(1)}万`
      : String(Math.round(n));
}
export function readStore<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`cloudmusic:${key}`) || "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
export function saveStore(key: string, value: unknown) {
  try {
    localStorage.setItem(`cloudmusic:${key}`, JSON.stringify(value));
  } catch {
    /* Optional preferences must not interrupt playback. */
  }
}
