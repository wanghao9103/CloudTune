(async () => {
  if (window.__cloudmusicSmokeStarted) return;
  window.__cloudmusicSmokeStarted = true;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const report = { ok: false, checks: {} };
  let lastAudio;
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    lastAudio = this;
    return nativePlay.call(this);
  };
  try {
    const call = (action, params = {}) =>
      invoke("music_request", { action, params });
    const r = await call("recommend", { limit: 7 });
    report.checks.recommend = r.code === 200 && r.result.length === 7;
    const s = await call("search", { keywords: "晴天", limit: 5 });
    report.checks.search = s.code === 200 && s.result.songs.length > 0;
    const p = await call("playlist", { id: r.result[0].id });
    report.checks.playlist = p.code === 200 && p.playlist.trackIds.length > 0;
    const ns = await call("newSongs", { limit: 5 });
    const songId = ns.result[0].id;
    const d = await call("songDetail", { ids: String(songId) });
    report.checks.songDetail = d.songs[0].id === songId;
    const u = await call("songUrl", { id: songId });
    report.checks.songUrl = u.code === 200 && !!u.data[0].url;
    const l = await call("lyric", { id: songId });
    report.checks.lyric = l.code === 200 && !!l.lrc.lyric;
    const q = await call("qrKey");
    report.checks.qrKey = q.code === 200 && !!q.unikey;
    const qc = await call("qrCheck", { key: q.unikey });
    report.checks.qrCheck = [801, 802].includes(qc.code);
    report.checks.noCredentialLeak = !Object.hasOwn(qc, "cookie");
    try {
      await call("https://example.com");
    } catch {
      report.checks.allowlist = true;
    }
    for (let i = 0; i < 50 && !document.querySelector(".playlist-card"); i++)
      await new Promise((r) => setTimeout(r, 100));
    report.checks.render =
      !!document.querySelector(".playlist-card") &&
      document.querySelector(".nav-item.active")?.textContent === "推荐";
    report.geometry = {
      html: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      body: [document.body.scrollWidth, document.body.scrollHeight],
      viewport: [innerWidth, innerHeight],
      shell: [
        document.querySelector(".app-shell").getBoundingClientRect().width,
        document.querySelector(".app-shell").getBoundingClientRect().height,
      ],
    };
    report.checks.layout =
      document.documentElement.scrollHeight === innerHeight &&
      document.documentElement.scrollWidth === innerWidth;
    report.checks.controls =
      document.querySelectorAll(".window-controls button").length === 3;
    await invoke("smoke_trace", { phase: "api" });
    const desktopState = await invoke("desktop_state");
    report.checks.tray = desktopState.trayCreated && desktopState.trayHost;
    await invoke("set_close_to_tray", { enabled: false });
    report.checks.closePreference = !(await invoke("desktop_state")).closeToTray;
    await invoke("set_close_to_tray", { enabled: true });
    await invoke("set_ui_zoom", { scale: 1.25 });
    await new Promise(r => setTimeout(r, 250));
    report.zoomGeometry = { viewport: [innerWidth, innerHeight], doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
    report.checks.zoom = innerWidth < report.geometry.viewport[0] && document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight;
    await invoke("set_ui_zoom", { scale: 1.0 });
    const cacheStarted = performance.now();
    const cachedBytes = await invoke("prepare_audio", {
      requestId: crypto.randomUUID(),
      url: u.data[0].url.replace(/^http:/, "https:"),
      expectedSize: u.data[0].freeTrialInfo ? 0 : u.data[0].size || 0,
    });
    const cachedMime = ({ mp3: "audio/mpeg", flac: "audio/flac", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" })[u.data[0].type] || "";
    const cachedUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("测试缓存转换失败"));
      reader.readAsDataURL(new Blob([cachedBytes], { type: cachedMime }));
    });
    report.checks.nativeAudioCache = cachedBytes instanceof ArrayBuffer && cachedBytes.byteLength > 0;
    report.cachePreparationMs = Math.round(performance.now() - cacheStarted);
    const a = new Audio(cachedUrl);
    a.volume = 0;
    await invoke("smoke_trace", { phase: "audio-start" });
    await Promise.race([a.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("音频启动超时")), 15000))]);
    await invoke("smoke_trace", { phase: "audio-ready" });
    await new Promise((r) => setTimeout(r, 1600));
    report.checks.audio = a.currentTime > 0 && !a.paused;
    if (window.__cloudmusicLongAudioSmoke) {
      if (a.duration < 130) throw new Error("测试音源时长不足以覆盖两分钟连续播放");
      const before = a.currentTime;
      let last = before;
      let frozenTicks = 0;
      for (let i = 0; i < 125; i++) {
        await new Promise(r => setTimeout(r, 1000));
        frozenTicks = a.currentTime - last < 0.1 ? frozenTicks + 1 : 0;
        if (a.paused || frozenTicks >= 3) throw new Error("本地缓存连续播放停滞");
        last = a.currentTime;
      }
      report.cachedContinuousPlayback = { before, after: a.currentTime };
      report.checks.cachedContinuousPlayback = a.currentTime - before > 120;
    }
    const cachedSeek = Math.min(135, a.duration * 0.7);
    a.currentTime = cachedSeek;
    for (let i = 0; i < 60 && (a.seeking || a.currentTime < cachedSeek + 0.1); i++)
      await new Promise(r => setTimeout(r, 100));
    report.checks.cachedAudioSeek = !a.seeking && a.currentTime > cachedSeek + 0.05 && !a.paused;
    a.pause();
    a.removeAttribute("src");
    a.load();
    // An unmuted silent PCM stream avoids audible test output and removes CDN buffering from the background check.
    const wav = new Uint8Array(44 + 44100 * 2 * 60);
    const header = new DataView(wav.buffer);
    const word = (offset, text) => [...text].forEach((c, i) => wav[offset + i] = c.charCodeAt(0));
    word(0, "RIFF"); header.setUint32(4, wav.length - 8, true); word(8, "WAVE"); word(12, "fmt ");
    header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
    header.setUint32(24, 44100, true); header.setUint32(28, 88200, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true);
    word(36, "data"); header.setUint32(40, wav.length - 44, true);
    const wavUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const background = new Audio(wavUrl);
    background.volume = 0.5;
    await background.play();
    await new Promise(r => setTimeout(r, 250));
    await invoke("smoke_second_instance", { delay: true });
    const beforeHidden = background.currentTime;
    await invoke("plugin:window|close", { label: "main" });
    await invoke("smoke_trace", { phase: "hidden" });
    report.checks.closeToTray = !(await invoke("smoke_window_state"));
    await new Promise(r => setTimeout(r, 1800));
    report.background = { beforeHidden, afterHidden: background.currentTime, hidden: document.hidden, paused: background.paused, duration: background.duration, readyState: background.readyState };
    report.checks.backgroundAudio = document.hidden && background.currentTime - beforeHidden > 1 && !background.paused;
    for (let i = 0; i < 60 && !(await invoke("smoke_window_state")); i++) await new Promise(r => setTimeout(r, 100));
    report.checks.singleInstanceRestore = await invoke("smoke_window_state");
    await invoke("smoke_trace", { phase: "restored" });
    background.pause();
    background.removeAttribute("src"); background.load(); URL.revokeObjectURL(wavUrl);
    // Exercise the application's controller as well as the engine. The PCM is
    // deliberately all zero; actual nonzero output is checked by audio-output-probe.py.
    const files = new DataTransfer();
    files.items.add(new File([wav], "CloudTune 合成播放烟测.wav", { type: "audio/wav" }));
    const input = document.querySelector('input[type="file"]');
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    [...document.querySelectorAll(".nav-item")].find(e => e.textContent.includes("本地音乐")).click();
    const waitUntil = async predicate => {
      for (let i = 0; i < 80; i++) {
        if (predicate()) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error("应用播放器状态检查超时");
    };
    await waitUntil(() => document.querySelector(".song-row .row-number"));
    document.querySelector(".song-row .row-number").click();
    const progress = () => Number(document.querySelector('[aria-label="播放进度"]').value);
    const playback = () => document.querySelector(".play-main").getAttribute("aria-label");
    await waitUntil(() => progress() > 2 && playback() === "暂停");
    const beforeRecovery = progress();
    document.querySelector(".audio-recovery").click();
    // DOM click runs in this same task; allow React to commit the recovery state
    // before checking the old button's enabled/playing attributes.
    await new Promise(r => setTimeout(r, 100));
    await waitUntil(() => !document.querySelector(".audio-recovery").disabled && playback() === "暂停");
    await new Promise(r => setTimeout(r, 150));
    const afterRecovery = progress();
    report.checks.applicationRecovery = afterRecovery >= beforeRecovery - 0.15 && afterRecovery < beforeRecovery + 2;
    document.querySelector(".play-main").click();
    await new Promise(r => setTimeout(r, 100));
    await waitUntil(() => playback() === "播放");
    const pausedPosition = progress();
    document.querySelector(".audio-recovery").click();
    await new Promise(r => setTimeout(r, 100));
    await waitUntil(() => !document.querySelector(".audio-recovery").disabled);
    await new Promise(r => setTimeout(r, 500));
    report.applicationPlayback = { beforeRecovery, afterRecovery, pausedPosition, afterPausedRecovery: progress(), state: playback() };
    report.checks.applicationPauseRespected = playback() === "播放" && Math.abs(progress() - pausedPosition) < 0.15;
    // A broken local resource must use bounded recovery and continue the queue.
    const failedFiles = new DataTransfer();
    for (const name of ["CloudTune 损坏音源一.wav", "CloudTune 损坏音源二.wav"])
      failedFiles.items.add(new File(["invalid synthetic audio"], name, { type: "audio/wav" }));
    failedFiles.items.add(new File([wav], "CloudTune 队列恢复成功.wav", { type: "audio/wav" }));
    input.files = failedFiles.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitUntil(() => document.querySelectorAll(".song-row").length === 4);
    document.querySelectorAll(".song-row .row-number")[1].click();
    await waitUntil(() => document.querySelector(".now-info .text-button").textContent.includes("队列恢复成功") && progress() > 0.2 && playback() === "暂停");
    report.checks.applicationQueueSkipsFailedFiles = true;
    document.querySelector(".play-main").click();
    // Exercise the real online App path, including IPC bytes -> inline audio, not only
    // a standalone media element or synthetic frontend bridge. Keep it silent.
    document.querySelector('button[title="静音"]')?.click();
    await new Promise(r => setTimeout(r, 100));
    [...document.querySelectorAll(".nav-item")].find(e => e.textContent === "推荐").click();
    await waitUntil(() => [...document.querySelectorAll(".music-section")].some(e => e.querySelector("h2")?.textContent.includes("最新音乐") && e.querySelector(".song-title .text-button")));
    const latest = [...document.querySelectorAll(".music-section")].find(e => e.querySelector("h2")?.textContent.includes("最新音乐"));
    const publicName = latest.querySelector(".song-title .text-button").textContent;
    latest.querySelector(".outline-button").click();
    await waitUntil(() => document.querySelector(".now-info .text-button").textContent === publicName && progress() > 0.3 && playback() === "暂停");
    report.checks.applicationOnlineBuffered = true;
    const onlineSeek = Math.min(135, lastAudio.duration * 0.6);
    lastAudio.currentTime = onlineSeek;
    await waitUntil(() => !lastAudio.seeking && progress() > onlineSeek);
    report.checks.applicationOnlineCachedSeek = true;
    const beforeOnlineRecovery = progress();
    document.querySelector(".audio-recovery").click();
    await new Promise(r => setTimeout(r, 100));
    await waitUntil(() => !document.querySelector(".audio-recovery").disabled && progress() > beforeOnlineRecovery && playback() === "暂停");
    report.checks.applicationOnlineCachedRecovery = true;
    document.querySelector(".play-main").click();
    report.ok = Object.values(report.checks).every(Boolean);
  } catch (e) {
    report.error = String(e.message || e);
    if (lastAudio) report.failedMedia = {
      position: lastAudio.currentTime, paused: lastAudio.paused,
      seeking: lastAudio.seeking, readyState: lastAudio.readyState,
      networkState: lastAudio.networkState, error: lastAudio.error?.code || 0,
      sourceKind: lastAudio.src.startsWith("data:audio/") ? "inline" : lastAudio.src.startsWith("blob:") ? "blob" : "other",
      buffered: [...Array(lastAudio.buffered.length)].map((_,i) => [lastAudio.buffered.start(i), lastAudio.buffered.end(i)]),
      status: document.querySelector(".now-info [role=status]")?.textContent,
    };
  }
  HTMLMediaElement.prototype.play = nativePlay;
  await invoke("smoke_report", { report });
})();
