(async () => {
  if (window.__cloudmusicSmokeStarted) return;
  window.__cloudmusicSmokeStarted = true;
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const report = { ok: false, checks: {} };
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
    const a = new Audio(u.data[0].url.replace(/^http:/, "https:"));
    a.volume = 0;
    await invoke("smoke_trace", { phase: "audio-start" });
    await Promise.race([a.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("音频启动超时")), 15000))]);
    await invoke("smoke_trace", { phase: "audio-ready" });
    await new Promise((r) => setTimeout(r, 1600));
    report.checks.audio = a.currentTime > 0 && !a.paused;
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
    report.ok = Object.values(report.checks).every(Boolean);
  } catch (e) {
    report.error = String(e.message || e);
  }
  await invoke("smoke_report", { report });
})();
