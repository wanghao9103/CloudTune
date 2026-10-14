import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:1453";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "1453",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tracks = [1, 2, 3].map((id) => ({
  id,
  name: `合成缓存歌曲${id}`,
  artist: "Synthetic",
  album: "",
  cover: "",
  duration: 30,
}));
const wav = Buffer.alloc(44 + 44100 * 2 * 30);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(44100, 24);
wav.writeUInt32LE(88200, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const report = {
  kind: "production frontend with mock native cache bridge",
  syntheticOnly: true,
  checks: {},
  pageErrors: [],
  externalRequests: [],
  ok: false,
};
let browser;
async function fixture(kind) {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.addInitScript(
    ({ tracks, kind, bytes }) => {
      localStorage.setItem("cloudmusic:history", JSON.stringify(tracks));
      const OriginalAudio = window.Audio;
      window.__audio = [];
      window.Audio = class extends OriginalAudio {
        constructor(...args) {
          super(...args);
          window.__audio.push(this);
        }
      };
      window.__createdUrls = [];
      window.__revokedUrls = [];
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        window.__createdUrls.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        window.__revokedUrls.push(url);
        revoke(url);
      };
      window.__readerAborts = 0;
      const abort = FileReader.prototype.abort,
        read = FileReader.prototype.readAsDataURL;
      let reads = 0;
      FileReader.prototype.abort = function () {
        window.__readerAborts++;
        return abort.call(this);
      };
      FileReader.prototype.readAsDataURL = function (blob) {
        if (["reading", "read-timeout"].includes(kind) && ++reads === 1) {
          window.__readingStarted = true;
          window.__releaseReader = () => read.call(this, blob);
        } else read.call(this, blob);
      };
      window.isTauri = true;
      window.__cacheCalls = [];
      window.__cancelCalls = [];
      window.__urlCalls = [];
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      window.__releaseCache = release;
      let callback = 0;
      window.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        convertFileSrc: (path) => path,
        invoke: async (command, args = {}) => {
          if (command === "music_request") {
            const { action, params } = args;
            if (action === "songUrl") {
              window.__urlCalls.push(params.id);
              return {
                code: 200,
                data: [
                  {
                    id: params.id,
                    url: `https://synthetic.test/${params.id}.wav`,
                    size: bytes.length,
                    type: "wav",
                  },
                ],
              };
            }
            return (
              {
                account: { code: 200, profile: null },
                recommend: { code: 200, result: [] },
                newSongs: { code: 200, result: [] },
                toplist: { code: 200, list: [] },
                banner: { code: 200, banners: [] },
              }[action] || { code: 200 }
            );
          }
          if (command === "prepare_audio") {
            window.__cacheCalls.push({ ...args });
            if (kind === "failed" && args.url.endsWith("/1.wav"))
              throw Error("音频缓存不完整，请重试");
            if (
              ["delayed", "timeout"].includes(kind) &&
              args.url.endsWith("/1.wav")
            )
              await gate;
            return new Uint8Array(bytes).buffer;
          }
          if (command === "cancel_audio") {
            window.__cancelCalls.push(args.requestId);
            return;
          }
          if (command === "desktop_state")
            return { trayCreated: false, trayHost: false, closeToTray: true };
          if (command === "plugin:event|listen") return ++callback;
          return null;
        },
      };
    },
    { tracks, kind, bytes: [...wav] },
  );
  page.on("pageerror", (error) => report.pageErrors.push(String(error)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(origin + "/") ||
      url.startsWith("blob:") ||
      url.startsWith("data:")
    )
      return route.continue();
    report.externalRequests.push(url);
    return route.abort();
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "最近播放", exact: true }).click();
  await page
    .locator(".song-row .song-title .text-button")
    .filter({ hasText: "合成缓存歌曲1" })
    .click();
  return page;
}
const playing = (page, id) =>
  page.waitForFunction(
    (id) =>
      document
        .querySelector(".now-info .text-button")
        .textContent.includes(`合成缓存歌曲${id}`) &&
      window.__audio[0].currentTime > 0.2 &&
      !window.__audio[0].paused,
    id,
  );
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await wait(100);
  }
  browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const normal = await fixture("normal");
  await playing(normal, 1);
  assert.equal(
    await normal.evaluate(() =>
      window.__audio[0].src.startsWith("data:audio/"),
    ),
    true,
  );
  await normal.evaluate(() => (window.__audio[0].currentTime = 12));
  await normal.waitForFunction(
    () => !window.__audio[0].seeking && window.__audio[0].currentTime > 12.1,
  );
  await normal.locator(".audio-recovery").click();
  await wait(100);
  await normal.waitForFunction(
    () =>
      !document.querySelector(".audio-recovery").disabled &&
      window.__audio[0].currentTime > 12.2 &&
      !window.__audio[0].paused,
  );
  assert.deepEqual(await normal.evaluate(() => window.__urlCalls), [1]);
  assert.equal(await normal.evaluate(() => window.__cacheCalls.length), 1);
  report.checks.cachedSeekAndRecoveryNeverRenewRemoteUrl = true;
  await normal.locator(".play-main").click();
  await wait(150);
  assert.equal(await normal.evaluate(() => window.__audio[0].paused), true);
  await normal.locator(".play-main").click();
  await wait(150);
  assert.equal(await normal.evaluate(() => window.__audio[0].paused), false);
  assert.equal(await normal.evaluate(() => window.__revokedUrls.length), 0);
  for (const id of [2, 3, 1]) {
    await normal
      .locator(".song-row .song-title .text-button")
      .filter({ hasText: `合成缓存歌曲${id}` })
      .click();
    await playing(normal, id);
  }
  assert.equal(await normal.evaluate(() => window.__createdUrls.length), 0);
  assert.equal(
    await normal.evaluate(() =>
      JSON.parse(localStorage.getItem("cloudmusic:history")).some(
        (t) => t.localUrl,
      ),
    ),
    false,
  );
  assert.equal(await normal.evaluate(() => window.__revokedUrls.length), 0);
  report.checks.pauseRetainsAndSwitchDropsInlineSource = true;
  await normal.close();
  for (const switchTrack of [false, true]) {
    const page = await fixture("delayed");
    await page.waitForFunction(() => window.__cacheCalls.length === 1);
    if (switchTrack)
      await page
        .locator(".song-row .song-title .text-button")
        .filter({ hasText: "合成缓存歌曲3" })
        .click();
    else await page.locator(".play-main").click();
    await page.evaluate(() => window.__releaseCache());
    await wait(400);
    assert.equal(await page.evaluate(() => window.__cancelCalls.length), 1);
    if (switchTrack) {
      await playing(page, 3);
      assert.deepEqual(await page.evaluate(() => window.__urlCalls), [1, 3]);
    } else {
      assert.equal(await page.evaluate(() => window.__audio[0].paused), true);
      assert.deepEqual(await page.evaluate(() => window.__urlCalls), [1]);
    }
    report.checks[
      switchTrack ? "switchIgnoresLateCache" : "pauseCancelsAndIgnoresLateCache"
    ] = true;
    await page.close();
  }
  const reading = await fixture("reading");
  await reading.waitForFunction(() => window.__readingStarted);
  await reading
    .locator(".song-row .song-title .text-button")
    .filter({ hasText: "合成缓存歌曲3" })
    .click();
  await playing(reading, 3);
  const before = await reading.evaluate(() => window.__audio[0].src);
  await reading.evaluate(() => window.__releaseReader());
  await wait(200);
  assert.equal(await reading.evaluate(() => window.__readerAborts), 1);
  assert.equal(await reading.evaluate(() => window.__audio[0].src), before);
  report.checks.switchCancelsInlineConversionAndIgnoresLateRead = true;
  await reading.close();
  const timeout = await fixture("timeout");
  timeout.setDefaultTimeout(20000);
  await playing(timeout, 2);
  await timeout.evaluate(() => window.__releaseCache());
  await wait(400);
  assert.deepEqual(await timeout.evaluate(() => window.__urlCalls), [1, 2]);
  assert.equal(await timeout.evaluate(() => window.__cancelCalls.length), 1);
  assert.equal(await timeout.evaluate(() => window.__createdUrls.length), 0);
  assert.equal(
    await timeout.evaluate(() =>
      window.__audio[0].src.startsWith("data:audio/"),
    ),
    true,
  );
  report.checks.binaryIpcTimeoutSkipsAndIgnoresLateBytes = true;
  await timeout.close();
  const readTimeout = await fixture("read-timeout");
  readTimeout.setDefaultTimeout(20000);
  await playing(readTimeout, 2);
  const convertedSource = await readTimeout.evaluate(
    () => window.__audio[0].src,
  );
  await readTimeout.evaluate(() => window.__releaseReader());
  await wait(200);
  assert.equal(await readTimeout.evaluate(() => window.__readerAborts), 1);
  assert.equal(
    await readTimeout.evaluate(() => window.__audio[0].src),
    convertedSource,
  );
  report.checks.inlineConversionSharesPreparationDeadline = true;
  await readTimeout.close();
  const failed = await fixture("failed");
  await playing(failed, 2);
  assert.deepEqual(await failed.evaluate(() => window.__urlCalls), [1, 2]);
  report.checks.incompleteCacheSkipsToNextTrack = true;
  await failed.close();
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalRequests, []);
  report.ok = true;
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/audio-source-ui.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
