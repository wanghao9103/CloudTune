import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const origin = "http://127.0.0.1:1455";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "1455",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  syntheticOnly: true,
  checks: {},
  pageErrors: [],
  externalRequests: [],
  ok: false,
};
// Silent PCM exercises actual media playback without hardware sound or user data.
const wav = Buffer.alloc(44 + 8000 * 2 * 10);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
let browser;

async function fixture(kind = "normal") {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.addInitScript(
    ({ kind, bytes }) => {
      const song = (id) => ({
        id,
        name: `合成歌曲${id}`,
        ar: [{ name: "Synthetic" }],
        dt: 10000,
      });
      localStorage.setItem(
        "cloudmusic:history",
        JSON.stringify([
          {
            id: 9,
            name: "手动选择歌曲",
            artist: "Synthetic",
            album: "",
            cover: "",
            duration: 10,
          },
        ]),
      );
      if (kind === "disabled")
        localStorage.setItem("cloudmusic:startupDaily", "false");
      const OriginalAudio = window.Audio;
      window.__audio = [];
      window.Audio = class extends OriginalAudio {
        constructor(...args) {
          super(...args);
          window.__audio.push(this);
        }
      };
      if (kind === "permission") {
        const play = HTMLMediaElement.prototype.play;
        let blocked = true;
        HTMLMediaElement.prototype.play = function (...args) {
          if (blocked) {
            blocked = false;
            return Promise.reject(
              new DOMException("gesture required", "NotAllowedError"),
            );
          }
          return play.apply(this, args);
        };
      }
      if (kind === "timeout") {
        const timeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) =>
          timeout(fn, ms === 10000 ? 100 : ms, ...args);
      }
      window.__calls = [];
      window.__dailyKind = kind;
      const dailyGate = new Promise((resolve) => {
        window.__releaseDaily = resolve;
      });
      const accountGate = new Promise((resolve) => {
        window.__releaseAccount = resolve;
      });
      window.isTauri = true;
      let callback = 0;
      window.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => ++callback,
        unregisterCallback: () => {},
        invoke: async (command, args = {}) => {
          if (command === "music_request") {
            const { action, params } = args;
            window.__calls.push({ action, params });
            if (action === "account") {
              if (kind === "slow-account") await accountGate;
              return {
                code: 200,
                profile:
                  kind === "guest"
                    ? null
                    : { userId: 123, nickname: "合成账号" },
              };
            }
            if (action === "daily") {
              if (["delayed", "timeout"].includes(window.__dailyKind))
                await dailyGate;
              if (window.__dailyKind === "failed")
                throw Error("合成每日推荐加载失败");
              return {
                code: 200,
                data: {
                  dailySongs:
                    window.__dailyKind === "empty" ? [] : [1, 2, 3].map(song),
                },
              };
            }
            if (action === "songUrl")
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
            return (
              {
                recommend: { result: [] },
                newSongs: { result: [{ song: song(99) }] },
                toplist: { list: [] },
                banner: { banners: [] },
                userPlaylists: { playlist: [] },
                likelist: { ids: [] },
              }[action] || { code: 200 }
            );
          }
          if (command === "prepare_audio") return new Uint8Array(bytes).buffer;
          if (command === "desktop_state")
            return { trayCreated: false, trayHost: false, closeToTray: true };
          if (command === "plugin:event|listen") return ++callback;
          return null;
        },
      };
    },
    { kind, bytes: [...wav] },
  );
  page.on("pageerror", (error) => report.pageErrors.push(String(error)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + "/") || /^(data|blob):/.test(url))
      return route.continue();
    report.externalRequests.push(url);
    return route.abort();
  });
  await page.goto(origin);
  return page;
}
const playing = (page, id = 1) =>
  page.waitForFunction(
    (id) =>
      document
        .querySelector(".now-info .text-button")
        .textContent.includes(id === 9 ? "手动选择歌曲" : `合成歌曲${id}`) &&
      !window.__audio[0].paused &&
      window.__audio[0].currentTime > 0.1,
    id,
  );
const urls = (page) =>
  page.evaluate(() =>
    window.__calls
      .filter((c) => c.action === "songUrl")
      .map((c) => c.params.id),
  );
const pending = (page) =>
  page.getByText("正在获取每日推荐…", { exact: true }).waitFor();
async function manual(page) {
  await page.getByRole("button", { name: "最近播放", exact: true }).click();
  await page
    .locator(".song-row .song-title .text-button")
    .filter({ hasText: "手动选择歌曲" })
    .click();
  await playing(page, 9);
}
async function settings(page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  return page.getByRole("checkbox", { name: "启动时播放每日推荐" });
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await wait(100);
  }
  browser = await chromium.launch({
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const normal = await fixture();
  await playing(normal);
  assert.deepEqual(await urls(normal), [1]);
  assert.equal(
    await normal.evaluate(
      () => window.__calls.filter((c) => c.action === "daily").length,
    ),
    1,
  );
  await normal.getByTitle("下一首", { exact: true }).click();
  await playing(normal, 2);
  assert.deepEqual(await urls(normal), [1, 2]);
  report.checks.startupAndDailyQueue = true;
  const toggle = await settings(normal);
  await toggle.uncheck();
  await normal.reload();
  await normal.getByText("合成账号", { exact: true }).waitFor();
  assert.deepEqual(await urls(normal), []);
  assert.equal(
    await normal.evaluate(() =>
      window.__calls.some((c) => c.action === "daily"),
    ),
    false,
  );
  await normal.getByRole("button", { name: "播放", exact: true }).click();
  await playing(normal);
  report.checks.persistedOptOutAndManualDefault = true;
  await normal.close();

  const guest = await fixture("guest");
  await guest
    .getByText("登录网易云账号后，即可播放每日推荐。", { exact: true })
    .waitFor();
  assert.deepEqual(await urls(guest), []);
  assert.equal(await guest.locator(".modal-close").count(), 0);
  await guest.getByRole("button", { name: "播放", exact: true }).click();
  await guest.locator(".modal-close").waitFor();
  report.checks.guestNeedsLogin = true;
  await guest.close();

  for (const kind of ["failed", "empty", "timeout"]) {
    const page = await fixture(kind);
    await page
      .getByText("每日推荐未能加载，点击播放重试", { exact: true })
      .waitFor();
    assert.deepEqual(await urls(page), []);
    await page.evaluate(() => {
      window.__dailyKind = "normal";
    });
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await playing(page);
    report.checks[`${kind}CanRetryWithoutNewSongFallback`] = true;
    await page.close();
  }
  const cancel = await fixture("delayed");
  await pending(cancel);
  await cancel.getByRole("button", { name: "暂停", exact: true }).click();
  await cancel.evaluate(() => window.__releaseDaily());
  await wait(200);
  assert.deepEqual(await urls(cancel), []);
  report.checks.cancelIgnoresLateDailyResponse = true;
  await cancel.close();

  const selected = await fixture("delayed");
  await pending(selected);
  await manual(selected);
  await selected.evaluate(() => window.__releaseDaily());
  await wait(200);
  assert.deepEqual(await urls(selected), [9]);
  report.checks.manualSelectionWins = true;
  await selected.close();

  const account = await fixture("slow-account");
  await manual(account);
  await account.evaluate(() => window.__releaseAccount());
  await wait(200);
  assert.deepEqual(await urls(account), [9]);
  assert.equal(
    await account.evaluate(() =>
      window.__calls.some((c) => c.action === "daily"),
    ),
    false,
  );
  report.checks.manualSelectionBeforeAccountRestoreWins = true;
  await account.close();

  const disabled = await fixture("delayed");
  await pending(disabled);
  await (await settings(disabled)).uncheck();
  await disabled.evaluate(() => window.__releaseDaily());
  await wait(200);
  assert.deepEqual(await urls(disabled), []);
  report.checks.disablingCancelsPendingStartup = true;
  await disabled.close();

  const permission = await fixture("permission");
  await permission.getByText("合成歌曲1", { exact: true }).first().waitFor();
  await permission.getByRole("button", { name: "播放", exact: true }).waitFor();
  assert.deepEqual(await urls(permission), [1]);
  await permission.getByRole("button", { name: "播放", exact: true }).click();
  await playing(permission);
  assert.deepEqual(await urls(permission), [1]);
  report.checks.permissionDenialWaitsForGesture = true;
  await permission.close();
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
    ".local/daily-playback-ui.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report));
