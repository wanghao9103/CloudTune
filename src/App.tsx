import { useState, useEffect, useRef, useCallback } from "react";
import { createPlaybackController, type PlaybackController } from "./playback";
import { getCurrentWindow } from "@tauri-apps/api/window";
import QRCode from "qrcode";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Heart,
  Home,
  Disc3,
  Compass,
  Clock3,
  FolderOpen,
  ListMusic,
  Music2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Minus,
  Square,
  Settings,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat2,
  Repeat1,
  Shuffle,
  Plus,
  RefreshCw,
  Headphones,
  CalendarDays,
  LogOut,
  Moon,
  Sun,
  Check,
  LoaderCircle,
  ArrowDownToLine,
  Radio,
  ListOrdered,
  SlidersHorizontal,
} from "lucide-react";
import {
  api,
  desktop,
  track,
  playlist,
  Track,
  Playlist,
  https,
  time,
  count,
  readStore,
  saveStore,
} from "./api";
type Page =
  | "home"
  | "discover"
  | "ranks"
  | "favorites"
  | "history"
  | "local"
  | "settings"
  | "search"
  | "playlist"
  | "daily";
type Profile = { userId: number; nickname: string; avatarUrl: string };
const categories = [
  "全部",
  "华语",
  "流行",
  "民谣",
  "轻音乐",
  "电子",
  "欧美",
  "古风",
];
function Cover({
  src,
  className = "",
  onClick,
}: {
  src?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={`cover ${className}`} onClick={onClick}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Music2 size={28} />
      )}
    </div>
  );
}
function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Disc3 size={50} strokeWidth={1} />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [backStack, setBackStack] = useState<Page[]>([]);
  const [forwardStack, setForwardStack] = useState<Page[]>([]);
  const [fontScale, setFontScale] = useState(() => {
    const value = Number(readStore("fontScale", 1));
    return [1, 1.12, 1.25].includes(value) ? value : 1;
  });
  const [uiScale, setUiScale] = useState(() => {
    const value = Number(readStore("uiScale", 1));
    return [0.9, 1, 1.1, 1.25].includes(value) ? value : 1;
  });
  const [desktopState, setDesktopState] = useState<{
    closeToTray: boolean;
    trayCreated: boolean;
    trayHost: boolean;
  } | null>(null);
  const [theme, setTheme] = useState(readStore("theme", "light"));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [recommend, setRecommend] = useState<Playlist[]>([]);
  const [newSongs, setNewSongs] = useState<Track[]>([]);
  const [rankLists, setRankLists] = useState<Playlist[]>([]);
  const [userLists, setUserLists] = useState<Playlist[]>([]);
  const [banner, setBanner] = useState<any>(null);
  const [homeError, setHomeError] = useState("");
  const [homeLoading, setHomeLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"songs" | "playlists">("songs");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [lists, setLists] = useState<Playlist[]>([]);
  const [activeList, setActiveList] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [cat, setCat] = useState("全部");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [trial, setTrial] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStore("volume", 0.7));
  const [mode, setMode] = useState<"list" | "one" | "shuffle">("list");
  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [favorites, setFavorites] = useState<Track[]>(
    readStore("favorites", []),
  );
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [history, setHistory] = useState<Track[]>(readStore("history", []));
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [quality, setQuality] = useState(readStore("quality", "exhigh"));
  const [toast, setToast] = useState("");
  const [lyricLines, setLyricLines] = useState<
    { time: number; text: string }[]
  >([]);
  const [lyricStatus, setLyricStatus] = useState("");
  const wasLoginOpen = useRef(false);
  useEffect(() => {
    if (loginOpen)
      document.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    else if (wasLoginOpen.current)
      document.querySelector<HTMLButtonElement>(".account")?.focus();
    wasLoginOpen.current = loginOpen;
  }, [loginOpen]);
  const [qr, setQr] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrGeneration, setQrGeneration] = useState(0);
  const [loginMode, setLoginMode] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [smsCountdown, setSmsCountdown] = useState(0);
  const loginAttempt = useRef(0);
  const [audio] = useState(() => ({ current: new Audio() }));
  const playback = useRef<PlaybackController | null>(null);
  const onTrackEnded = useRef<() => void>(() => {});
  const sourceLoading = useRef(false);
  const playGeneration = useRef(0);
  const loadGeneration = useRef(0);
  const localUrls = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lyricRef = useRef<HTMLDivElement>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const navigate = useCallback(
    (next: Page) => {
      if (next !== page) {
        setBackStack((s) => [...s, page]);
        setForwardStack([]);
        setPage(next);
      }
      setAccountOpen(false);
    },
    [page],
  );
  const goBack = () => {
    const prev = backStack.at(-1);
    if (prev) {
      setBackStack((s) => s.slice(0, -1));
      setForwardStack((s) => [...s, page]);
      setPage(prev);
    }
  };
  const goForward = () => {
    const next = forwardStack.at(-1);
    if (next) {
      setForwardStack((s) => s.slice(0, -1));
      setBackStack((s) => [...s, page]);
      setPage(next);
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveStore("theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-scale",
      String(fontScale),
    );
    saveStore("fontScale", fontScale);
  }, [fontScale]);
  useEffect(() => {
    if (desktop) {
      void invoke("set_ui_zoom", { scale: uiScale })
        .then(() => saveStore("uiScale", uiScale))
        .catch(() => notify("界面缩放未能应用，请重试。"));
    } else {
      document.documentElement.style.setProperty(
        "--preview-scale",
        String(uiScale),
      );
      saveStore("uiScale", uiScale);
    }
  }, [uiScale, notify]);
  useEffect(() => {
    if (!desktop) return;
    let canceled = false;
    void invoke<typeof desktopState>("desktop_state")
      .then((state) => {
        if (!canceled) setDesktopState(state);
      })
      .catch(() => notify("无法读取托盘设置。"));
    return () => {
      canceled = true;
    };
  }, [notify]);
  const changeCloseToTray = async (enabled: boolean) => {
    try {
      await invoke("set_close_to_tray", { enabled });
      setDesktopState((state) => state && { ...state, closeToTray: enabled });
    } catch {
      notify("关闭窗口的设置未能保存，请重试。");
    }
  };
  useEffect(() => {
    audio.current.volume = volume;
    saveStore("volume", volume);
  }, [volume]);
  useEffect(() => {
    saveStore("quality", quality);
  }, [quality]);
  useEffect(() => {
    saveStore("favorites", favorites);
  }, [favorites]);
  useEffect(() => {
    saveStore(
      "history",
      history.filter((t) => !t.localUrl),
    );
  }, [history]);
  useEffect(
    () => () => {
      audio.current.pause();
      audio.current.removeAttribute("src");
      localUrls.current.forEach(URL.revokeObjectURL);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const refreshAccount = useCallback(async () => {
    try {
      const r = await api("account");
      const p = r.profile;
      setProfile(p || null);
      if (p) {
        const [u, l] = await Promise.allSettled([
          api("userPlaylists", { uid: p.userId }),
          api("likelist", { uid: p.userId }),
        ]);
        if (u.status === "fulfilled")
          setUserLists((u.value.playlist || []).map(playlist));
        if (l.status === "fulfilled") setLikedIds(l.value.ids || []);
      }
    } catch {
      /* A guest can browse without signing in. */
    }
  }, []);
  const loadHome = useCallback(async () => {
    setHomeLoading(true);
    setHomeError("");
    const results = await Promise.allSettled([
      api("recommend", { limit: 21 }),
      api("newSongs", { limit: 12 }),
      api("toplist"),
      api("banner"),
    ]);
    if (results[0].status === "fulfilled")
      setRecommend((results[0].value.result || []).map(playlist));
    else setHomeError("暂时无法获取推荐内容，请检查网络后重试。");
    if (results[1].status === "fulfilled")
      setNewSongs(
        (results[1].value.result || []).map((s: any) => track(s.song)),
      );
    if (results[2].status === "fulfilled")
      setRankLists((results[2].value.list || []).map(playlist));
    if (results[3].status === "fulfilled")
      setBanner(results[3].value.banners?.[0]);
    setHomeLoading(false);
  }, []);
  useEffect(() => {
    void loadHome();
    void refreshAccount();
  }, [loadHome, refreshAccount]);
  const playTrack = useCallback(
    async (t: Track, source?: Track[]) => {
      const generation = ++playGeneration.current;
      sourceLoading.current = true;
      playback.current?.reset();
      setPlaying(false);
      setBuffering(true);
      setTrial(false);
      setCurrent(t);
      setPosition(0);
      setDuration(t.duration);
      if (source) setQueue(source);
      try {
        let url = t.localUrl;
        if (!url) {
          const r = await api("songUrl", {
            id: t.id,
            br: quality === "standard" ? 128000 : 320000,
          });
          if (generation !== playGeneration.current) return;
          const data = r.data?.[0];
          if (!data?.url)
            throw Error("这首歌暂时无法播放，可能需要会员或受版权限制。");
          url = https(data.url);
          if (data.freeTrialInfo) {
            setTrial(true);
            notify("当前为试听片段，完整播放需要对应的账号权限。");
          }
        }
        if (generation !== playGeneration.current) return;
        sourceLoading.current = false;
        await playback.current?.playSource(url!);
        if (generation !== playGeneration.current) return;
        setHistory((h) => [t, ...h.filter((x) => x.id !== t.id)].slice(0, 100));
      } catch (e) {
        if (generation === playGeneration.current) {
          sourceLoading.current = false;
          setBuffering(false);
          notify(e instanceof Error ? e.message : "播放失败，请重试。");
        }
      }
    },
    [notify, quality],
  );
  const pausePlayback = useCallback(() => {
    ++playGeneration.current;
    sourceLoading.current = false;
    playback.current?.pause();
    setBuffering(false);
  }, []);
  const resumePlayback = useCallback(() => {
    if (buffering) return;
    if (!current) {
      if (newSongs[0]) void playTrack(newSongs[0], newSongs);
      else notify("先选一首喜欢的歌吧");
      return;
    }
    if (!audio.current.getAttribute("src")) {
      void playTrack(current);
      return;
    }
    void playback.current?.resume().catch(() => {});
  }, [buffering, current, newSongs, notify, playTrack]);
  const togglePlay = useCallback(() => {
    if (recovering || buffering || playing || !audio.current.paused)
      pausePlayback();
    else resumePlayback();
  }, [recovering, buffering, playing, pausePlayback, resumePlayback]);
  const recoverSound = useCallback(() => {
    if (!current || !audio.current.getAttribute("src")) return;
    const generation = playGeneration.current;
    const controller = playback.current;
    void controller
      ?.recover()
      .then(() => {
        if (
          generation === playGeneration.current &&
          controller === playback.current
        )
          notify("已刷新声音，保留当前歌曲和进度。");
      })
      .catch(() => {});
  }, [current, notify]);
  const nextTrack = useCallback(
    (direction = 1) => {
      if (!queue.length) return;
      const i = queue.findIndex((t) => t.id === current?.id);
      let index = (i + direction + queue.length) % queue.length;
      if (mode === "shuffle" && queue.length > 1) {
        do {
          index = Math.floor(Math.random() * queue.length);
        } while (index === i);
      }
      void playTrack(queue[index]);
    },
    [queue, current, mode, playTrack],
  );
  onTrackEnded.current = () => {
    if (mode === "one") {
      playback.current?.seek(0);
      void playback.current?.resume().catch(() => {});
    } else nextTrack();
  };
  useEffect(() => {
    const controller = createPlaybackController(audio.current, {
      onState: (state) => {
        setPlaying(state.playing);
        setBuffering(state.buffering || sourceLoading.current);
        setRecovering(state.recovering);
        setPosition(state.position);
        if (Number.isFinite(state.duration) && state.duration > 0)
          setDuration(state.duration);
      },
      onError: notify,
      onEnded: () => onTrackEnded.current(),
    });
    playback.current = controller;
    return () => {
      controller.dispose();
      if (playback.current === controller) playback.current = null;
    };
  }, [audio, notify]);
  const closeLogin = useCallback(() => {
    loginAttempt.current++;
    setLoginOpen(false);
    setCaptcha("");
    setLoginError("");
    setPhoneBusy(false);
    void api("cancelLogin").catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLyricsOpen(false);
        setQueueOpen(false);
        closeLogin();
        setAccountOpen(false);
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) ||
          e.target.isContentEditable)
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.ctrlKey && e.key === "ArrowRight") {
        e.preventDefault();
        nextTrack();
      }
      if (e.ctrlKey && e.key === "ArrowLeft") {
        e.preventDefault();
        nextTrack(-1);
      }
      if (e.key === "Escape") {
        setLyricsOpen(false);
        setQueueOpen(false);
        closeLogin();
        setAccountOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, nextTrack, closeLogin]);
  const trayControls = useRef({ togglePlay, nextTrack });
  trayControls.current = { togglePlay, nextTrack };
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("tray-control", ({ payload }) => {
      if (disposed) return;
      if (payload === "toggle") trayControls.current.togglePlay();
      if (payload === "previous") trayControls.current.nextTrack(-1);
      if (payload === "next") trayControls.current.nextTrack();
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => notify("托盘播放控制暂不可用。"));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [notify]);
  useEffect(() => {
    if (!desktop) return;
    void invoke("sync_tray", {
      title: current ? `${current.name} — ${current.artist}` : "",
      playing,
      ready: !buffering && (!!current || newSongs.length > 0),
      canSkip: !buffering && queue.length > 0,
    }).catch(() => {
      /* Tray may be unavailable on some desktops. */
    });
  }, [current, playing, buffering, newSongs.length, queue.length]);
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.name,
        artist: current.artist,
        album: current.album,
        artwork: current.cover ? [{ src: current.cover }] : [],
      });
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
      navigator.mediaSession.setActionHandler("play", resumePlayback);
      navigator.mediaSession.setActionHandler("pause", pausePlayback);
      navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        nextTrack(-1),
      );
    } catch {
      /* Unsupported WebKit media-session actions are optional. */
    }
  }, [current, playing, resumePlayback, pausePlayback, nextTrack]);
  useEffect(() => {
    let canceled = false;
    setLyricLines([]);
    if (!current || current.localUrl) {
      setLyricStatus(
        current?.localUrl ? "本地音乐暂无在线歌词" : "选择歌曲后显示歌词",
      );
      return;
    }
    setLyricStatus("正在获取歌词…");
    api("lyric", { id: current.id })
      .then((r) => {
        if (canceled) return;
        const lines: string[] = (r.lrc?.lyric || "").split("\n");
        const parsed = lines
          .flatMap((line) => {
            const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
            const text = line.replace(/\[[^\]]+\]/g, "").trim();
            return text
              ? matches.map((m) => ({
                  time: Number(m[1]) * 60 + Number(m[2]),
                  text,
                }))
              : [];
          })
          .sort((a, b) => a.time - b.time);
        setLyricLines(parsed);
        setLyricStatus(parsed.length ? "" : "暂无歌词，静静听一会儿吧");
      })
      .catch(() => {
        if (!canceled) setLyricStatus("歌词加载失败");
      });
    return () => {
      canceled = true;
    };
  }, [current]);
  const activeLyric = lyricLines.findLastIndex((l) => l.time <= position);
  useEffect(() => {
    if (lyricsOpen)
      lyricRef.current
        ?.querySelector(".active")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLyric, lyricsOpen]);
  const openPlaylist = useCallback(
    (p: Playlist) => {
      setActiveList(p);
      setOffset(0);
      navigate("playlist");
    },
    [navigate],
  );
  const search = () => {
    if (!query.trim()) return;
    setSearchTerm(query.trim());
    setOffset(0);
    navigate("search");
  };
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    if (
      !["discover", "search", "playlist", "daily", "favorites"].includes(page)
    )
      return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setPageError("");
    setTracks([]);
    setLists([]);
    (async () => {
      try {
        if (page === "discover") {
          const r = await api("topPlaylists", { cat, limit: 35, offset });
          if (generation === loadGeneration.current) {
            setLists((r.playlists || []).map(playlist));
            setTotal(r.total || 0);
          }
        } else if (page === "search") {
          const r = await api("search", {
            keywords: searchTerm,
            type: searchType === "songs" ? 1 : 1000,
            offset,
            limit: 50,
          });
          if (generation === loadGeneration.current) {
            setTracks((r.result?.songs || []).map(track));
            setLists((r.result?.playlists || []).map(playlist));
            setTotal(r.result?.songCount || r.result?.playlistCount || 0);
          }
        } else if (page === "playlist" && activeList) {
          const r = await api("playlist", { id: activeList.id });
          const p = playlist(r.playlist);
          const ids = (r.playlist.trackIds || [])
            .slice(offset, offset + 100)
            .map((i: any) => i.id);
          const songs = ids.length
            ? await api("songDetail", { ids: ids.join(",") })
            : { songs: [] };
          if (generation === loadGeneration.current) {
            setActiveList(p);
            setTotal(r.playlist.trackIds?.length || 0);
            setTracks((songs.songs || []).map(track));
          }
        } else if (page === "daily") {
          if (!profile) throw Error("登录网易云账号后，即可获取每日推荐。");
          const r = await api("daily");
          if (generation === loadGeneration.current)
            setTracks((r.data?.dailySongs || []).map(track));
        } else if (page === "favorites" && profile) {
          const r = await api("likelist", { uid: profile.userId });
          const ids = r.ids || [];
          const songs = ids.length
            ? await api("songDetail", {
                ids: ids.slice(offset, offset + 100).join(","),
              })
            : { songs: [] };
          if (generation === loadGeneration.current) {
            setLikedIds(ids);
            setTotal(ids.length);
            setTracks((songs.songs || []).map(track));
          }
        }
      } catch (e) {
        if (generation === loadGeneration.current)
          setPageError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (generation === loadGeneration.current) setLoading(false);
      }
    })();
    return () => {
      loadGeneration.current++;
    };
    // A playlist object is refreshed by its own response; its id is the request identity.
  }, [
    page,
    cat,
    offset,
    searchTerm,
    searchType,
    activeList?.id,
    profile?.userId,
  ]);
  useEffect(() => {
    if (!loginOpen || loginMode !== "qr") return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    setQr("");
    setQrLoading(true);
    setQrStatus("正在生成二维码…");
    const run = async () => {
      try {
        const r = await api("qrKey");
        if (canceled) return;
        const key = r.unikey;
        const data = await QRCode.toDataURL(
          `https://music.163.com/login?codekey=${encodeURIComponent(key)}`,
          { width: 220, margin: 1, errorCorrectionLevel: "M" },
        );
        if (canceled) return;
        setQr(data);
        setQrLoading(false);
        setQrStatus("使用网易云音乐 App 扫码登录");
        const poll = async () => {
          try {
            const res = await api("qrCheck", { key });
            if (canceled) return;
            if (res.code === 803) {
              setLoginOpen(false);
              await refreshAccount();
              notify(res.sessionWarning || "登录成功，欢迎回来");
              return;
            }
            if (res.code === 800) {
              setQrStatus("二维码已过期，请点击刷新");
              return;
            }
            setQrStatus(
              res.code === 802
                ? "扫码成功，请在手机上确认"
                : "使用网易云音乐 App 扫码登录",
            );
            timer = setTimeout(poll, 2500);
          } catch {
            if (!canceled) {
              setQrStatus("连接中断，请刷新二维码");
            }
          }
        };
        timer = setTimeout(poll, 2000);
      } catch {
        if (!canceled) {
          setQrLoading(false);
          setQrStatus("二维码生成失败，请检查网络后重试");
        }
      }
    };
    void run();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [loginOpen, loginMode, qrGeneration, refreshAccount, notify]);
  useEffect(() => {
    if (!smsCountdown) return;
    const timer = setTimeout(() => setSmsCountdown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);
  const sendCaptcha = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setLoginError("请输入正确的中国大陆手机号");
      return;
    }
    setPhoneBusy(true);
    setLoginError("");
    try {
      await api("captchaSend", { phone });
      setSmsCountdown(60);
      notify("验证码已发送，请查收短信");
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setPhoneBusy(false);
    }
  };
  const phoneLogin = async () => {
    if (!/^1\d{10}$/.test(phone) || !/^\d{4,8}$/.test(captcha)) {
      setLoginError("请输入正确的手机号和验证码");
      return;
    }
    const attempt = ++loginAttempt.current;
    setPhoneBusy(true);
    setLoginError("");
    try {
      const r = await api("phoneLogin", { phone, captcha });
      if (attempt !== loginAttempt.current) return;
      setLoginOpen(false);
      setCaptcha("");
      await refreshAccount();
      notify(r.sessionWarning || "登录成功，欢迎回来");
    } catch (e) {
      if (attempt === loginAttempt.current)
        setLoginError(e instanceof Error ? e.message : "登录失败");
    } finally {
      if (attempt === loginAttempt.current) setPhoneBusy(false);
    }
  };
  const logout = async () => {
    try {
      await api("logout");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "已退出本机登录；远端退出未确认。",
      );
    }
    setProfile(null);
    setUserLists([]);
    setLikedIds([]);
    setAccountOpen(false);
  };
  const isLiked = (t: Track) =>
    profile && !t.localUrl
      ? likedIds.includes(t.id)
      : favorites.some((x) => x.id === t.id);
  const toggleLike = async (t: Track) => {
    const liked = isLiked(t);
    if (profile && !t.localUrl) {
      try {
        await api("like", { id: t.id, like: !liked });
        setLikedIds((s) =>
          liked ? s.filter((id) => id !== t.id) : [...s, t.id],
        );
        notify(liked ? "已取消喜欢" : "已添加到我喜欢的音乐");
      } catch (e) {
        notify(e instanceof Error ? e.message : "收藏失败");
      }
    } else {
      setFavorites((s) => (liked ? s.filter((x) => x.id !== t.id) : [t, ...s]));
      notify(liked ? "已移出本机收藏" : "已加入本机收藏");
    }
  };
  const importLocal = (files: FileList | null) => {
    if (!files) return;
    const imported = Array.from(files)
      .filter((f) => /\.(mp3|flac|ogg|wav|m4a|aac|opus)$/i.test(f.name))
      .map((f, i) => {
        const url = URL.createObjectURL(f);
        localUrls.current.push(url);
        return {
          id: -(Date.now() + i),
          name: f.name.replace(/\.[^.]+$/, ""),
          artist: "本地音乐",
          album: "",
          cover: "",
          duration: 0,
          localUrl: url,
        };
      });
    setLocalTracks((s) => [...s, ...imported]);
    notify(`已导入 ${imported.length} 首本地音乐`);
    if (inputRef.current) inputRef.current.value = "";
  };
  const windowAction = async (
    action: "minimize" | "toggleMaximize" | "close",
  ) => {
    if (desktop) await getCurrentWindow()[action]();
  };
  const displayTracks =
    page === "history"
      ? history
      : page === "local"
        ? localTracks
        : page === "favorites" && !profile
          ? favorites
          : tracks;
  const rows = (songs: Track[], compact = false) => (
    <div className={compact ? "new-song-grid" : "song-table"}>
      {!compact && (
        <div className="table-heading">
          <span>#</span>
          <span>音乐标题</span>
          <span>专辑</span>
          <span>时长</span>
          <span />
        </div>
      )}
      {songs.map((t, i) => (
        <div
          className={`song-row ${current?.id === t.id ? "selected" : ""}`}
          key={t.id}
          onDoubleClick={() => void playTrack(t, songs)}
        >
          <button
            className="row-number icon"
            title={`播放 ${t.name}`}
            aria-label={`播放 ${t.name}`}
            onClick={() => void playTrack(t, songs)}
          >
            {current?.id === t.id && playing ? (
              <span className="equalizer">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <>
                <span>{String(i + 1 + offset).padStart(2, "0")}</span>
                <Play size={14} className="row-play" />
              </>
            )}
          </button>
          <div className="song-title">
            <Cover src={t.cover} onClick={() => void playTrack(t, songs)} />
            <div>
              <button
                className="text-button ellipsis"
                onClick={() => void playTrack(t, songs)}
              >
                {t.name}
                {t.fee === 1 && <small className="vip">VIP</small>}
              </button>
              <p className="ellipsis">{t.artist}</p>
            </div>
          </div>
          {!compact && <span className="album ellipsis">{t.album || "—"}</span>}
          {!compact && (
            <span className="song-time">
              {t.duration ? time(t.duration) : "—"}
            </span>
          )}
          <button
            className={`icon like ${isLiked(t) ? "liked" : ""}`}
            title={isLiked(t) ? "取消喜欢" : "喜欢"}
            onClick={() => void toggleLike(t)}
          >
            <Heart size={17} fill={isLiked(t) ? "currentColor" : "none"} />
          </button>
        </div>
      ))}
    </div>
  );
  const cards = (ps: Playlist[], tall = false) => (
    <div className={`playlist-grid ${tall ? "tall" : ""}`}>
      {ps.map((p, i) => (
        <button
          key={p.id}
          className="playlist-card"
          onClick={() => openPlaylist(p)}
        >
          <div className="playlist-art">
            <Cover src={p.cover} />
            <span className="play-count">
              <Headphones size={11} />
              {count(p.count)}
            </span>
            {tall && (
              <span className="card-top-label">
                {p.name.includes("欧美")
                  ? "欧美精选"
                  : p.name.includes("古风")
                    ? "国风精选"
                    : p.name.includes("学习")
                      ? "学习专属"
                      : p.name.includes("emo")
                        ? "情绪歌单"
                        : p.name.includes("热")
                          ? "热门精选"
                          : "为你推荐"}
              </span>
            )}
            <span className="card-play">
              <Play size={20} fill="currentColor" />
            </span>
            {tall && (
              <span className="card-caption">
                <span>{p.name}</span>
              </span>
            )}
          </div>
          {!tall && <span className="card-name">{p.name}</span>}
        </button>
      ))}
    </div>
  );
  const pager = (size: number) => (
    <div className="pager">
      <button
        className="icon"
        disabled={offset === 0 || loading}
        onClick={() => setOffset((s) => Math.max(0, s - size))}
        aria-label="上一页"
      >
        <ChevronLeft size={18} />
      </button>
      <span>
        {Math.floor(offset / size) + 1} / {Math.max(1, Math.ceil(total / size))}
      </span>
      <button
        className="icon"
        disabled={offset + size >= total || loading}
        onClick={() => setOffset((s) => s + size)}
        aria-label="下一页"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
  const navItem = (p: Page, label: string, Icon: typeof Home) => (
    <button
      className={`nav-item ${page === p ? "active" : ""}`}
      onClick={() => {
        setOffset(0);
        navigate(p);
      }}
    >
      <Icon size={18} fill={p === "favorites" ? "currentColor" : "none"} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("home")}>
          <span className="brand-mark">
            <img src="/icon.svg" alt="" />
          </span>
          <strong>CloudTune</strong>
        </button>
        <nav>
          {navItem("home", "推荐", Home)}
          {navItem("discover", "精选", Compass)}
          {navItem("ranks", "排行榜", ListOrdered)}
          <div className="nav-separator" />
          <span className="nav-label">我的</span>
          {navItem("favorites", "我喜欢的音乐", Heart)}
          {navItem("history", "最近播放", Clock3)}
          {navItem("local", "本地音乐", FolderOpen)}
          <div className="nav-separator" />
          <div className="nav-label label-row">
            <span>创建的歌单 {profile ? `(${userLists.length})` : ""}</span>
            <button
              className="icon"
              title="登录后同步歌单"
              onClick={() =>
                profile ? navigate("favorites") : setLoginOpen(true)
              }
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="user-playlists">
            {userLists.length ? (
              userLists.map((p) => (
                <button
                  key={p.id}
                  className={`user-playlist ${page === "playlist" && activeList?.id === p.id ? "chosen" : ""}`}
                  onClick={() => openPlaylist(p)}
                >
                  <Cover src={p.cover} />
                  <span className="ellipsis">{p.name}</span>
                </button>
              ))
            ) : (
              <button
                className="sidebar-login"
                onClick={() => setLoginOpen(true)}
              >
                <ListMusic size={25} />
                <span>登录，听见你的音乐</span>
                <small>同步歌单与喜欢的歌曲</small>
              </button>
            )}
          </div>
        </nav>
        <div className="sidebar-footer">
          <span className="platform-dot" /> Linux 桌面版 <span>0.1.3</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="titlebar" data-tauri-drag-region>
          <div className="history-buttons">
            <button
              className="icon"
              onClick={goBack}
              disabled={!backStack.length}
              aria-label="后退"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon"
              onClick={goForward}
              disabled={!forwardStack.length}
              aria-label="前进"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Search size={17} />
            <input
              aria-label="搜索音乐"
              placeholder="搜索音乐、歌手、歌单"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="icon"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X size={13} />
              </button>
            )}
          </form>
          <div className="titlebar-spacer" data-tauri-drag-region />
          <div className="account-wrap">
            <button
              className="account"
              aria-label={profile ? `账号 ${profile.nickname}` : "未登录"}
              onClick={() =>
                profile ? setAccountOpen(!accountOpen) : setLoginOpen(true)
              }
            >
              <Cover src={profile?.avatarUrl} />
              <span>{profile?.nickname || "未登录"}</span>
              <ChevronDown size={13} />
            </button>
            {accountOpen && (
              <div className="account-menu">
                <strong>{profile?.nickname}</strong>
                <button onClick={() => navigate("favorites")}>
                  <Heart size={16} />
                  我喜欢的音乐
                </button>
                <button onClick={() => void logout()}>
                  <LogOut size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
          <button
            className="icon top-settings"
            title="设置"
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
          </button>
          <button
            className="icon theme-button"
            title="切换主题"
            onClick={() => setTheme((s) => (s === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {desktop && (
            <div className="window-controls">
              <button
                onClick={() => void windowAction("minimize")}
                aria-label="最小化"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => void windowAction("toggleMaximize")}
                aria-label="最大化或还原"
              >
                <Square size={12} />
              </button>
              <button
                className="close-window"
                onClick={() => void windowAction("close")}
                aria-label="关闭窗口"
              >
                <X size={17} />
              </button>
            </div>
          )}
        </header>
        <main className="content" ref={mainRef}>
          {page === "home" && (
            <>
              <div className="home-feature">
                <button
                  className={`promo-banner ${banner ? "live-banner" : ""}`}
                  style={
                    banner
                      ? {
                          backgroundImage: `url(${https(banner.imageUrl || banner.pic)})`,
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (banner?.targetType === 1)
                      api("songDetail", { ids: String(banner.targetId) })
                        .then(
                          (r) =>
                            r.songs?.[0] &&
                            playTrack(track(r.songs[0]), [track(r.songs[0])]),
                        )
                        .catch(() => notify("歌曲加载失败"));
                    else if (recommend[0]) openPlaylist(recommend[0]);
                  }}
                >
                  {!banner && (
                    <>
                      <span>音乐与生活</span>
                      <strong>
                        把日子
                        <br />
                        听成喜欢的样子
                      </strong>
                      <small>总有一首歌，懂此刻的你</small>
                    </>
                  )}
                  <span className="banner-tag">
                    {banner?.typeTitle || "精选歌单"}
                  </span>
                  <div className="banner-dots">
                    <i className="active" />
                    <i />
                    <i />
                  </div>
                </button>
                <div className="greeting-panel">
                  <h3>
                    {new Date().getHours() < 12
                      ? "上午好"
                      : new Date().getHours() < 18
                        ? "下午好"
                        : "晚上好"}
                    ，
                    <span>
                      {profile ? "猜你喜欢这些" : "发现属于你的好音乐"}
                    </span>
                  </h3>
                  <div className="mini-playlists">
                    {recommend.slice(0, 4).map((p) => (
                      <button key={p.id} onClick={() => openPlaylist(p)}>
                        <Cover src={p.cover} />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="mood-panel"
                  onClick={() => {
                    setCat("夜晚");
                    setOffset(0);
                    navigate("discover");
                  }}
                >
                  <div>
                    <strong>夜晚</strong>
                    <span>
                      此刻听什么 <ChevronRight size={12} />
                    </span>
                  </div>
                  <div className="moon-art" />
                  <small>把心事交给音乐</small>
                </button>
              </div>
              <section className="music-section">
                <div className="section-heading">
                  <h2>精选推荐</h2>
                  <button
                    className="icon"
                    title="刷新推荐"
                    onClick={() => void loadHome()}
                    disabled={homeLoading}
                  >
                    <RefreshCw
                      size={18}
                      className={homeLoading ? "spin" : ""}
                    />
                  </button>
                </div>
                {homeLoading && !recommend.length ? (
                  <div className="skeleton-grid">
                    {Array.from({ length: 7 }, (_, i) => (
                      <div className="skeleton" key={i} />
                    ))}
                  </div>
                ) : homeError ? (
                  <Empty
                    title="推荐暂时不可用"
                    detail={homeError}
                    action={
                      <button
                        className="outline-button"
                        onClick={() => void loadHome()}
                      >
                        重新加载
                      </button>
                    }
                  />
                ) : (
                  <div className="featured-grid">
                    <button
                      className="daily-card"
                      onClick={() => {
                        setOffset(0);
                        navigate("daily");
                      }}
                    >
                      <CalendarDays size={22} />
                      <strong>{new Date().getDate()}</strong>
                      <div>
                        <b>每日推荐</b>
                        <span>为你挑选的好音乐</span>
                      </div>
                      <span className="card-play">
                        <Play size={20} fill="currentColor" />
                      </span>
                    </button>
                    {cards(recommend.slice(0, 6), true)}
                  </div>
                )}
              </section>
              <section className="music-section">
                <div className="section-heading">
                  <button
                    className="heading-link"
                    onClick={() => navigate("discover")}
                  >
                    <h2>推荐歌单</h2>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="text-button more"
                    onClick={() => navigate("discover")}
                  >
                    查看更多 <ChevronRight size={14} />
                  </button>
                </div>
                {cards(recommend.slice(6, 13))}
              </section>
              <section className="music-section">
                <div className="section-heading">
                  <h2>
                    最新音乐 <ChevronRight size={18} />
                  </h2>
                  <button
                    className="outline-button small"
                    disabled={!newSongs.length}
                    onClick={() => void playTrack(newSongs[0], newSongs)}
                  >
                    <Play size={13} />
                    播放全部
                  </button>
                </div>
                {rows(newSongs, true)}
              </section>
              <div className="content-end">好音乐，值得反复聆听</div>
            </>
          )}
          {page === "discover" && (
            <>
              <div className="page-heading">
                <h1>精选</h1>
                <span>发现下一首心动的音乐</span>
              </div>
              <div className="page-tabs">
                <button className="active">歌单广场</button>
                <button onClick={() => navigate("ranks")}>排行榜</button>
              </div>
              <div className="category-row">
                {categories.map((c) => (
                  <button
                    className={cat === c ? "active" : ""}
                    key={c}
                    onClick={() => {
                      setCat(c);
                      setOffset(0);
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {!loading && !pageError && cards(lists)}
              {!loading && !pageError && pager(35)}
            </>
          )}
          {page === "ranks" && (
            <>
              <div className="page-heading">
                <h1>排行榜</h1>
                <span>听见正在流行的声音</span>
              </div>
              <div className="section-heading">
                <h2>官方榜</h2>
              </div>
              <div className="rank-grid">
                {rankLists.slice(0, 4).map((p, i) => (
                  <button
                    className={`rank-card rank-${i}`}
                    key={p.id}
                    onClick={() => openPlaylist(p)}
                  >
                    <div>
                      <h2>{p.name}</h2>
                      <span>官方更新 · {count(p.count)} 次播放</span>
                      <div className="rank-line" />
                      <p>听见音乐的每一次跃升</p>
                    </div>
                    <span className="round-play">
                      <Play size={22} fill="currentColor" />
                    </span>
                  </button>
                ))}
              </div>
              <div className="section-heading spaced">
                <h2>全球榜</h2>
              </div>
              {cards(rankLists.slice(4))}
            </>
          )}
          {page === "search" && (
            <>
              <div className="page-heading">
                <h1>搜索 “{searchTerm}”</h1>
                <span>找到 {total} 个结果</span>
              </div>
              <div className="page-tabs">
                <button
                  className={searchType === "songs" ? "active" : ""}
                  onClick={() => {
                    setSearchType("songs");
                    setOffset(0);
                  }}
                >
                  单曲
                </button>
                <button
                  className={searchType === "playlists" ? "active" : ""}
                  onClick={() => {
                    setSearchType("playlists");
                    setOffset(0);
                  }}
                >
                  歌单
                </button>
              </div>
              {!loading &&
                !pageError &&
                (searchType === "songs" ? rows(tracks) : cards(lists))}
              {!loading && !pageError && !tracks.length && !lists.length && (
                <Empty
                  title="没有找到相关音乐"
                  detail="试试其他歌名、歌手或关键词"
                />
              )}
              {!loading && !pageError && total > 50 && pager(50)}
            </>
          )}
          {page === "playlist" && activeList && (
            <>
              <div className="playlist-header">
                <Cover src={activeList.cover} />
                <div>
                  <span className="pill">歌单</span>
                  <h1>{activeList.name}</h1>
                  <p className="playlist-author">
                    {activeList.creator || "网易云音乐"}{" "}
                    <span>
                      · {activeList.trackCount || total} 首歌曲 ·{" "}
                      {count(activeList.count)} 次播放
                    </span>
                  </p>
                  <p className="playlist-description">
                    {activeList.description || "在这里，遇见你喜欢的音乐。"}
                  </p>
                  <button
                    className="primary-button"
                    disabled={!tracks.length || loading}
                    onClick={() => void playTrack(tracks[0], tracks)}
                  >
                    <Play size={16} fill="currentColor" />
                    播放全部
                  </button>
                  <button
                    className="outline-button"
                    disabled={!tracks.length}
                    onClick={() => {
                      setQueue((s) => [
                        ...s,
                        ...tracks.filter((t) => !s.some((x) => x.id === t.id)),
                      ]);
                      notify("已添加到播放队列");
                    }}
                  >
                    <Plus size={16} />
                    加入队列
                  </button>
                </div>
              </div>
              <div className="page-tabs">
                <button className="active">
                  歌曲列表 <small>{total}</small>
                </button>
              </div>
              {!loading && !pageError && rows(tracks)}
              {!loading && total > 100 && pager(100)}
            </>
          )}
          {["favorites", "history", "local", "daily"].includes(page) && (
            <>
              <div className="page-heading">
                <h1>
                  {
                    {
                      favorites: profile ? "我喜欢的音乐" : "我喜欢的音乐",
                      history: "最近播放",
                      local: "本地音乐",
                      daily: "每日推荐",
                    }[page as "favorites" | "history" | "local" | "daily"]
                  }
                </h1>
                <span>
                  {page === "favorites"
                    ? profile
                      ? "与网易云账号同步"
                      : "本机收藏 · 登录后可查看账号收藏"
                    : page === "history"
                      ? `${history.length} 首 · 留住听过的好音乐`
                      : page === "local"
                        ? "MP3、FLAC、OGG、WAV 等音频文件"
                        : "每天，听见新鲜的好音乐"}
                </span>
              </div>
              <div className="library-actions">
                <button
                  className="primary-button"
                  disabled={!displayTracks.length || loading}
                  onClick={() =>
                    void playTrack(displayTracks[0], displayTracks)
                  }
                >
                  <Play size={16} fill="currentColor" />
                  播放全部
                </button>
                {page === "local" && (
                  <button
                    className="outline-button"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Plus size={16} />
                    添加本地音乐
                  </button>
                )}
                {page === "favorites" && !profile && (
                  <button
                    className="outline-button"
                    onClick={() => setLoginOpen(true)}
                  >
                    登录并同步
                  </button>
                )}
                {page === "history" && history.length > 0 && (
                  <button
                    className="text-button more"
                    onClick={() => setHistory([])}
                  >
                    清空记录
                  </button>
                )}
              </div>
              {!loading &&
                !pageError &&
                displayTracks.length > 0 &&
                rows(displayTracks)}
              {!loading && !pageError && !displayTracks.length && (
                <Empty
                  title={
                    page === "local"
                      ? "把喜欢的音乐带进来"
                      : page === "history"
                        ? "还没有播放记录"
                        : "收藏你的第一首好音乐"
                  }
                  detail={
                    page === "local"
                      ? "添加电脑上的音频文件，离线也能听。文件仅在本次会话中保留。"
                      : page === "history"
                        ? "听过的音乐会在这里等你"
                        : "点击歌曲旁的爱心，下次更快找到它"
                  }
                  action={
                    page === "local" ? (
                      <button
                        className="outline-button"
                        onClick={() => inputRef.current?.click()}
                      >
                        <FolderOpen size={16} />
                        选择音乐文件
                      </button>
                    ) : undefined
                  }
                />
              )}
              {page === "favorites" &&
                profile &&
                total > 100 &&
                !loading &&
                pager(100)}
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-heading">
                <h1>设置</h1>
                <span>让音乐，更合你的心意</span>
              </div>
              <div className="settings-section">
                <h2>外观</h2>
                <div className="setting-row">
                  <div>
                    <strong>主题</strong>
                    <p>延续 Windows 客户端的浅色与深色外观</p>
                  </div>
                  <div className="segmented">
                    <button
                      className={theme === "light" ? "active" : ""}
                      onClick={() => setTheme("light")}
                    >
                      <Sun size={16} />
                      浅色
                    </button>
                    <button
                      className={theme === "dark" ? "active" : ""}
                      onClick={() => setTheme("dark")}
                    >
                      <Moon size={16} />
                      深色
                    </button>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <h2>显示与桌面</h2>
                <div className="setting-row">
                  <div>
                    <strong>字体大小</strong>
                    <p>调整界面文字，设置自动保存</p>
                  </div>
                  <select
                    aria-label="字体大小"
                    value={fontScale}
                    onChange={(e) => setFontScale(Number(e.target.value))}
                  >
                    <option value="1">标准</option>
                    <option value="1.12">较大</option>
                    <option value="1.25">大</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>界面缩放</strong>
                    <p>文字、图标和控件一起缩放，适合不同分辨率</p>
                  </div>
                  <select
                    aria-label="界面缩放"
                    value={uiScale}
                    onChange={(e) => setUiScale(Number(e.target.value))}
                  >
                    <option value="0.9">90%</option>
                    <option value="1">100%</option>
                    <option value="1.1">110%</option>
                    <option value="1.25">125%</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>关闭窗口时收起到托盘</strong>
                    <p>
                      {!desktop
                        ? "此选项在桌面应用中可用"
                        : desktopState?.trayCreated === false
                          ? "当前桌面无法创建托盘图标，关闭窗口将退出"
                          : "收起后继续播放，通过托盘菜单恢复窗口或退出"}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="关闭窗口时收起到托盘"
                    disabled={!desktopState?.trayCreated}
                    checked={desktopState?.closeToTray ?? false}
                    onChange={(e) => void changeCloseToTray(e.target.checked)}
                  />
                </div>
                {desktop && desktopState && !desktopState.trayHost && (
                  <p className="tray-hint">
                    系统未提供托盘区域时，关闭窗口会最小化，仍可从任务栏恢复。GNOME
                    可启用 AppIndicator 扩展。
                  </p>
                )}
              </div>
              <div className="settings-section">
                <h2>播放</h2>
                <div className="setting-row">
                  <div>
                    <strong>在线音质</strong>
                    <p>对下一首歌曲生效，可用音质取决于账号与版权权限</p>
                  </div>
                  <select
                    aria-label="在线音质"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                  >
                    <option value="standard">标准 · 128 kbps</option>
                    <option value="exhigh">极高 · 320 kbps</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>声音恢复</strong>
                    <p>截图提示音或切换耳机后若没有声音，可保留当前进度恢复</p>
                  </div>
                  <button
                    className="outline-button"
                    disabled={
                      !current ||
                      recovering ||
                      !audio.current.getAttribute("src")
                    }
                    onClick={recoverSound}
                  >
                    {recovering ? "正在恢复…" : "恢复声音"}
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>快捷键</strong>
                    <p>
                      空格：播放 / 暂停 · Ctrl + ← / →：上一首 / 下一首 ·
                      Esc：关闭浮层
                    </p>
                  </div>
                </div>
              </div>
              <div className="settings-section">
                <h2>账号与隐私</h2>
                <div className="setting-row">
                  <div>
                    <strong>
                      {profile
                        ? `已登录 · ${profile.nickname}`
                        : "未登录网易云音乐"}
                    </strong>
                    <p>
                      {desktop
                        ? "登录凭据由系统 Secret Service 密钥环保存，网页不接收账号 Cookie。"
                        : "当前为浏览器预览，登录只保留在开发服务的内存中。"}
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() =>
                      profile ? void logout() : setLoginOpen(true)
                    }
                  >
                    {profile ? "退出登录" : "扫码登录"}
                  </button>
                </div>
              </div>
              <div className="about-app">
                <span className="brand-mark">
                  <img src="/icon.svg" alt="" />
                </span>
                <h2>CloudTune</h2>
                <span>0.1.3 · Tauri 2</span>
                <p>
                  面向 Linux 的第三方桌面客户端，界面参考 Windows 3.x 版。
                  <br />
                  通过网易云音乐 Web API 获取音乐，不绕过账号与版权权限。
                </p>
                <a
                  href="https://music.163.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  网易云音乐官网 <ChevronRight size={13} />
                </a>
              </div>
            </>
          )}
          {loading &&
            ["discover", "search", "playlist", "favorites", "daily"].includes(
              page,
            ) && (
              <div className="loading">
                <LoaderCircle size={25} className="spin" />
                <span>正在加载音乐…</span>
              </div>
            )}
          {pageError &&
            ["discover", "search", "playlist", "favorites", "daily"].includes(
              page,
            ) && (
              <Empty
                title="暂时无法加载"
                detail={pageError}
                action={
                  page === "daily" && !profile ? (
                    <button
                      className="primary-button"
                      onClick={() => setLoginOpen(true)}
                    >
                      扫码登录
                    </button>
                  ) : (
                    <button
                      className="outline-button"
                      onClick={() => {
                        setOffset(0);
                        const p = page;
                        setPage("home");
                        setTimeout(() => setPage(p), 0);
                      }}
                    >
                      重新加载
                    </button>
                  )
                }
              />
            )}
        </main>
      </div>
      <footer className="player">
        <div className="now-playing">
          <button
            className="now-cover"
            onClick={() => setLyricsOpen(true)}
            title="展开播放页"
          >
            <Cover src={current?.cover} />
            <ChevronDown size={18} />
          </button>
          <div className="now-info">
            <button
              className="text-button ellipsis"
              onClick={() => setLyricsOpen(true)}
            >
              {current?.name || "听见你的热爱"}
              {trial && <small className="trial-tag">试听</small>}
            </button>
            <span className="ellipsis">
              {current?.artist || "选择一首音乐，开始聆听"}
            </span>
          </div>
          <button
            className={`icon like ${current && isLiked(current) ? "liked" : ""}`}
            disabled={!current}
            title="喜欢当前歌曲"
            onClick={() => current && void toggleLike(current)}
          >
            <Heart
              size={20}
              fill={current && isLiked(current) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="player-center">
          <div className="transport">
            <button
              className="icon mode"
              title={
                mode === "list"
                  ? "列表循环"
                  : mode === "one"
                    ? "单曲循环"
                    : "随机播放"
              }
              onClick={() =>
                setMode((m) =>
                  m === "list" ? "one" : m === "one" ? "shuffle" : "list",
                )
              }
            >
              {mode === "list" ? (
                <Repeat2 size={19} />
              ) : mode === "one" ? (
                <Repeat1 size={19} />
              ) : (
                <Shuffle size={19} />
              )}
            </button>
            <button
              className="icon"
              title="上一首"
              disabled={!queue.length}
              onClick={() => nextTrack(-1)}
            >
              <SkipBack size={21} fill="currentColor" />
            </button>
            <button
              className="play-main"
              title={
                recovering
                  ? "正在恢复声音，点击取消"
                  : buffering || playing
                    ? "暂停"
                    : "播放"
              }
              aria-label={recovering || buffering || playing ? "暂停" : "播放"}
              onClick={togglePlay}
            >
              {buffering ? (
                <LoaderCircle size={20} className="spin" />
              ) : playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <button
              className="icon"
              title="下一首"
              disabled={!queue.length}
              onClick={() => nextTrack()}
            >
              <SkipForward size={21} fill="currentColor" />
            </button>
            <button
              className={`icon ${lyricsOpen ? "accent" : ""}`}
              title="歌词"
              onClick={() => setLyricsOpen((s) => !s)}
            >
              <span className="lyric-icon">词</span>
            </button>
          </div>
          <div className="progress">
            <span>{time(position)}</span>
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={Math.min(position, duration || 1)}
              disabled={!current || !audio.current.getAttribute("src")}
              style={
                {
                  "--progress": `${duration ? (position / duration) * 100 : 0}%`,
                } as React.CSSProperties
              }
              onChange={(e) => {
                playback.current?.seek(Number(e.target.value));
              }}
            />
            <span>{time(duration)}</span>
          </div>
        </div>
        <div className="player-right">
          <button
            className="icon audio-recovery"
            title="恢复声音（保留当前歌曲和进度）"
            aria-label="恢复声音"
            disabled={
              !current || recovering || !audio.current.getAttribute("src")
            }
            onClick={recoverSound}
          >
            <RefreshCw size={18} className={recovering ? "spin" : ""} />
          </button>
          <button
            className="quality-label"
            title="音质设置"
            onClick={() => navigate("settings")}
          >
            {quality === "standard" ? "标准" : "极高"}
          </button>
          <button
            className="icon"
            title={volume ? "静音" : "取消静音"}
            onClick={() => setVolume((v) => (v ? 0 : 0.7))}
          >
            {volume ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <input
            aria-label="音量"
            className="volume-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            style={{ "--progress": `${volume * 100}%` } as React.CSSProperties}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <div className="player-divider" />
          <button
            className={`icon queue-toggle ${queueOpen ? "accent" : ""}`}
            title="播放列表"
            onClick={() => setQueueOpen((s) => !s)}
          >
            <ListMusic size={23} />
            <small>{queue.length}</small>
          </button>
        </div>
      </footer>
      {queueOpen && (
        <div className="queue-panel">
          <div className="queue-heading">
            <h2>
              播放列表 <span>({queue.length})</span>
            </h2>
            <button
              className="icon"
              title="关闭播放列表"
              onClick={() => setQueueOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="queue-tools">
            <span>共 {queue.length} 首歌曲</span>
            <button className="text-button" onClick={() => setQueue([])}>
              清空
            </button>
          </div>
          <div className="queue-songs">
            {queue.length ? (
              queue.map((t, i) => (
                <div
                  className={`queue-song ${current?.id === t.id ? "active" : ""}`}
                  key={`${t.id}-${i}`}
                >
                  <button
                    className="text-button"
                    onClick={() => void playTrack(t)}
                  >
                    <span className="ellipsis">{t.name}</span>
                    <small className="ellipsis">{t.artist}</small>
                  </button>
                  <button
                    className="icon"
                    title={`移出 ${t.name}`}
                    onClick={() => setQueue((s) => s.filter((_, n) => n !== i))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            ) : (
              <Empty title="播放列表是空的" detail="播放歌曲或把歌单加入队列" />
            )}
          </div>
        </div>
      )}
      {lyricsOpen && (
        <div className="lyrics-page">
          <button
            className="lyrics-close icon"
            aria-label="收起播放页"
            onClick={() => setLyricsOpen(false)}
          >
            <ChevronDown size={26} />
          </button>
          <div className="record-column">
            <div className={`vinyl ${playing ? "rotating" : ""}`}>
              <Cover src={current?.cover} />
              <div className="vinyl-center" />
            </div>
            <div className="record-caption">
              <span>YUNTING MUSIC</span>
              <p>音乐，因你而动听</p>
            </div>
          </div>
          <div className="lyric-column">
            <h1>{current?.name || "听见你的热爱"}</h1>
            <p>{current?.artist || "让音乐陪伴每一个日常"}</p>
            <div className="lyric-scroll" ref={lyricRef}>
              {lyricLines.length ? (
                lyricLines.map((l, i) => (
                  <button
                    className={i === activeLyric ? "active" : ""}
                    key={`${l.time}-${i}`}
                    onClick={() => {
                      if (audio.current.getAttribute("src"))
                        playback.current?.seek(l.time);
                    }}
                  >
                    {l.text}
                  </button>
                ))
              ) : (
                <div className="lyric-empty">{lyricStatus}</div>
              )}
            </div>
          </div>
        </div>
      )}
      {loginOpen && (
        <div className="modal-backdrop" onClick={closeLogin}>
          <div
            className="login-modal"
            role="dialog"
            aria-modal="true"
            aria-label="登录CloudTune"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const elements = e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled)",
              );
              const first = elements[0],
                last = elements[elements.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
          >
            <button
              className="icon modal-close"
              aria-label="关闭登录"
              onClick={closeLogin}
            >
              <X size={21} />
            </button>
            <span className="brand-mark">
              <img src="/icon.svg" alt="" />
            </span>
            <h2>登录CloudTune</h2>
            <p>用网易云音乐账号，让熟悉的音乐继续</p>
            <div className="login-tabs">
              <button
                className={loginMode === "qr" ? "active" : ""}
                onClick={() => {
                  setLoginMode("qr");
                  setLoginError("");
                }}
              >
                扫码登录
              </button>
              <button
                className={loginMode === "phone" ? "active" : ""}
                onClick={() => {
                  setLoginMode("phone");
                  setLoginError("");
                  void api("cancelLogin").catch(() => {});
                }}
              >
                手机号登录
              </button>
            </div>
            {loginMode === "qr" ? (
              <>
                <div className="qr-box">
                  {qrLoading ? (
                    <LoaderCircle size={30} className="spin" />
                  ) : qr ? (
                    <img src={qr} alt="网易云音乐登录二维码" />
                  ) : (
                    <Radio size={35} />
                  )}
                </div>
                <div className="qr-status">{qrStatus}</div>
                <button
                  className="text-button refresh-qr"
                  onClick={() => setQrGeneration((s) => s + 1)}
                >
                  <RefreshCw size={14} />
                  刷新二维码
                </button>
                <div className="login-instructions">
                  <span>
                    打开 <b>网易云音乐 App</b>
                  </span>
                  <span>点击左上角菜单，使用「扫一扫」</span>
                </div>
              </>
            ) : (
              <form
                className="phone-login"
                onSubmit={(e) => {
                  e.preventDefault();
                  void phoneLogin();
                }}
              >
                <label>
                  手机号码
                  <div className="phone-input">
                    <span>+86</span>
                    <input
                      aria-label="手机号码"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      placeholder="请输入手机号"
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                </label>
                <label>
                  短信验证码
                  <div className="captcha-input">
                    <input
                      aria-label="短信验证码"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      placeholder="请输入验证码"
                      value={captcha}
                      onChange={(e) =>
                        setCaptcha(e.target.value.replace(/\D/g, ""))
                      }
                    />
                    <button
                      type="button"
                      disabled={phoneBusy || smsCountdown > 0}
                      onClick={() => void sendCaptcha()}
                    >
                      {smsCountdown ? `${smsCountdown}s` : "获取验证码"}
                    </button>
                  </div>
                </label>
                {loginError && (
                  <div className="login-error" role="alert">
                    {loginError}
                  </div>
                )}
                <button
                  type="submit"
                  className="primary-button"
                  disabled={phoneBusy}
                >
                  {phoneBusy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : null}
                  登录
                </button>
                <p>
                  使用已有的网易云音乐账号登录。
                  <br />
                  若网易云要求额外验证，请使用扫码登录。
                </p>
              </form>
            )}
            <small>
              登录表示你使用自己的网易云音乐账号
              <br />
              本客户端不会获取你的账号密码
            </small>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.flac,.ogg,.wav,.m4a,.aac,.opus,audio/*"
        multiple
        hidden
        onChange={(e) => importLocal(e.target.files)}
      />
    </div>
  );
}
