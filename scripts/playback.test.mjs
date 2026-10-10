import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackController } from "../src/playback.ts";

test("automatic recovery renews the same track URL and preserves the stalled position", async () => {
  const f = setup();
  let renewals = 0;
  await f.controller.playSource(
    "https://example.test/expired.mp3",
    async () => {
      renewals++;
      return "https://example.test/renewed.mp3";
    },
  );
  assert.equal(renewals, 0);
  f.controller.seek(135);
  await f.clock.advance(6000);
  assert.equal(renewals, 1);
  assert.equal(f.audio.src, "https://example.test/renewed.mp3");
  assert.ok(f.audio.currentTime >= 135 && f.audio.currentTime < 135.2);
  assert.equal(f.state().playing, true);
  assert.deepEqual(f.errors, []);
  f.controller.dispose();
});

test("pause and switching tracks invalidate a pending renewed URL", async () => {
  for (const switchTrack of [false, true]) {
    const f = setup();
    const pending = deferred();
    await f.controller.playSource(
      "https://example.test/old.mp3",
      () => pending.promise,
    );
    f.controller.seek(135);
    const recovering = f.controller.recover();
    await flush();
    if (switchTrack)
      await f.controller.playSource("https://example.test/new.mp3");
    else f.controller.pause();
    pending.resolve("https://example.test/late-old.mp3");
    await recovering;
    await flush();
    assert.equal(
      f.audio.src,
      switchTrack
        ? "https://example.test/new.mp3"
        : "https://example.test/old.mp3",
    );
    assert.equal(f.audio.paused, !switchTrack);
    assert.equal(f.state().recovering, false);
    assert.deepEqual(f.errors, []);
    f.controller.dispose();
    assert.equal(f.clock.jobs.size, 0);
  }
});

test("renewed URL requests time out and leave interrupted playback stopped", async () => {
  const f = setup();
  let renewals = 0;
  await f.controller.playSource("https://example.test/song.mp3", () => {
    renewals++;
    return new Promise(() => {});
  });
  f.controller.seek(135);
  await f.clock.advance(8000);
  assert.equal(renewals, 2);
  assert.equal(f.state().playing, false);
  assert.equal(f.state().recovering, false);
  assert.equal(f.state().buffering, false);
  assert.equal(f.audio.paused, true);
  assert.equal(f.errors.length, 1);
  f.controller.dispose();
  assert.equal(f.clock.jobs.size, 0);
});

const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

class Clock {
  time = 0;
  nextId = 1;
  jobs = new Map();
  now = () => this.time;
  setTimeout = (fn, delay) => this.add(fn, delay, false);
  setInterval = (fn, delay) => this.add(fn, delay, true);
  clearTimeout = (id) => this.jobs.delete(id);
  clearInterval = (id) => this.jobs.delete(id);
  add(fn, delay, repeated) {
    const id = this.nextId++;
    this.jobs.set(id, { fn, at: this.time + delay, delay, repeated });
    return id;
  }
  async advance(ms) {
    const target = this.time + ms;
    for (;;) {
      const entry = [...this.jobs]
        .filter(([, job]) => job.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, job] = entry;
      this.time = job.at;
      if (job.repeated) job.at += job.delay;
      else this.jobs.delete(id);
      job.fn();
      await flush();
    }
    this.time = target;
    await flush();
  }
}

class Audio extends EventTarget {
  src = "";
  paused = true;
  ended = false;
  seeking = false;
  currentTime = 0;
  duration = NaN;
  readyState = 0;
  volume = 0.7;
  muted = false;
  playCalls = 0;
  loadCalls = 0;
  pauseCalls = 0;
  autoMetadata = true;
  advanceAfterRecoveryPlay = true;
  playPlans = [];
  fire(name) {
    this.dispatchEvent(new Event(name));
  }
  getAttribute(name) {
    return name === "src" ? this.src || null : null;
  }
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
  load() {
    const serial = ++this.loadCalls;
    this.paused = true;
    this.ended = false;
    this.seeking = false;
    this.currentTime = 0;
    this.duration = NaN;
    this.readyState = 0;
    this.fire("emptied");
    if (this.src && this.autoMetadata)
      queueMicrotask(() => {
        if (this.loadCalls !== serial) return;
        this.readyState = 4;
        this.duration = 180;
        this.fire("loadedmetadata");
        this.fire("canplay");
      });
  }
  play() {
    this.playCalls++;
    const plan = this.playPlans.shift();
    return (plan ? plan() : Promise.resolve()).then(() => {
      this.paused = false;
      this.ended = false;
      this.fire("playing");
      // A rebuilt resource must demonstrate real clock progress. Keep initial
      // playback frozen so watchdog tests control that transition explicitly.
      if (this.loadCalls > 1 && this.advanceAfterRecoveryPlay) {
        this.currentTime += 0.1;
        this.fire("timeupdate");
      }
    });
  }
  pause() {
    this.pauseCalls++;
    if (!this.paused) {
      this.paused = true;
      // Browser pause events are asynchronous; mimic this important race.
      queueMicrotask(() => this.fire("pause"));
    }
  }
  interrupt() {
    this.paused = true;
    this.fire("pause");
  }
}

function setup(extra = {}) {
  const audio = new Audio();
  const clock = new Clock();
  const states = [],
    errors = [];
  let ended = 0;
  const lifecycle = new EventTarget();
  const visibility = new EventTarget();
  const controller = createPlaybackController(audio, {
    onState: (state) => states.push(state),
    onError: (message) => errors.push(message),
    onEnded: () => ended++,
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    lifecycleTarget: lifecycle,
    visibilityTarget: visibility,
    recoveryTimeoutMs: 1000,
    ...extra,
  });
  return {
    audio,
    clock,
    states,
    errors,
    lifecycle,
    visibility,
    controller,
    state: () => states.at(-1),
    ended: () => ended,
  };
}

test("resume is idempotent and buffering state follows media events", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  assert.equal(f.state().playing, true);
  await f.controller.resume();
  await f.controller.resume();
  assert.equal(f.audio.playCalls, 1);
  assert.equal(f.audio.paused, false);
  f.audio.fire("waiting");
  assert.equal(f.state().buffering, true);
  assert.equal(f.state().playing, false);
  f.audio.fire("canplay");
  f.audio.fire("playing");
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().playing, true);
  f.controller.dispose();
});

test("a deliberate pause cancels pending play, including a late native playing event", async () => {
  const f = setup();
  const pending = deferred();
  f.audio.playPlans.push(() => pending.promise);
  const started = f.controller.playSource("https://example.test/song-a.mp3");
  assert.equal(f.state().buffering, true);
  f.controller.pause();
  assert.equal(f.state().playing, false);
  assert.equal(f.state().buffering, false);
  pending.resolve();
  await started;
  await flush();
  await f.clock.advance(30000);
  assert.equal(f.audio.paused, true);
  assert.equal(f.audio.loadCalls, 1);
  assert.deepEqual(f.errors, []);
  f.controller.dispose();
});

test("repeated resume while the native play promise is pending does not restart it", async () => {
  const f = setup();
  const pending = deferred();
  f.audio.playPlans.push(() => pending.promise);
  const started = f.controller.playSource("https://example.test/song-a.mp3");
  await f.controller.resume();
  await f.controller.resume();
  assert.equal(f.audio.playCalls, 1);
  pending.resolve();
  await started;
  assert.equal(f.state().playing, true);
  f.controller.dispose();
});

test("switching tracks invalidates a late failure or success from the old play", async () => {
  for (const rejects of [false, true]) {
    const f = setup();
    const pending = deferred();
    f.audio.playPlans.push(() => pending.promise);
    const old = f.controller.playSource("https://example.test/old.mp3");
    await f.controller.playSource("https://example.test/new.mp3");
    if (rejects) pending.reject(new Error("old request failed"));
    else pending.resolve();
    await old;
    await flush();
    assert.equal(f.audio.src, "https://example.test/new.mp3");
    assert.equal(f.state().playing, true);
    assert.deepEqual(f.errors, []);
    f.controller.dispose();
  }
});

test("rebuilding preserves position, volume and mute, and leaves a deliberate pause paused", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(47.5);
  f.audio.volume = 0.31;
  f.audio.muted = true;
  await f.controller.recover();
  assert.equal(f.audio.currentTime, 47.6);
  assert.equal(f.audio.volume, 0.31);
  assert.equal(f.audio.muted, true);
  assert.equal(f.state().playing, true);
  f.controller.pause();
  await flush();
  const playCalls = f.audio.playCalls;
  await f.controller.recover();
  assert.equal(f.audio.currentTime, 47.6);
  assert.equal(f.audio.playCalls, playCalls);
  assert.equal(f.audio.paused, true);
  assert.equal(f.state().playing, false);
  assert.equal(f.state().recovering, false);
  f.controller.dispose();
});

test("a playing clock, focus return and seek do not trigger audio reloads", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  for (let i = 0; i < 20; i++) {
    f.audio.currentTime += 1;
    f.audio.fire("timeupdate");
    f.lifecycle.dispatchEvent(new Event("focus"));
    f.visibility.dispatchEvent(new Event("visibilitychange"));
    await f.clock.advance(1000);
  }
  assert.equal(f.audio.loadCalls, 1);
  f.audio.seeking = true;
  await f.clock.advance(2000);
  assert.equal(f.audio.loadCalls, 1);
  f.audio.seeking = false;
  f.controller.seek(70);
  await f.clock.advance(5000);
  assert.equal(f.audio.loadCalls, 1);
  f.controller.dispose();
});

test("a cached seek completes without another playing or canplay event", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.seeking = true;
  f.audio.fire("seeking");
  assert.equal(f.state().buffering, true);
  f.audio.currentTime = 40;
  f.audio.seeking = false;
  f.audio.fire("seeked");
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().playing, true);
  assert.equal(f.audio.loadCalls, 1);
  f.controller.dispose();
});

test("real clock progress clears buffering without another playing event", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.fire("waiting");
  assert.equal(f.state().buffering, true);
  assert.equal(f.state().playing, false);
  f.audio.fire("timeupdate");
  assert.equal(f.state().buffering, true);
  f.audio.seeking = true;
  f.audio.currentTime = 40;
  f.audio.fire("timeupdate");
  assert.equal(f.state().buffering, true);
  f.audio.seeking = false;
  f.audio.currentTime += 0.1;
  f.audio.fire("timeupdate");
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().playing, true);
  assert.equal(f.audio.loadCalls, 1);
  f.controller.dispose();
});

test("a stuck native seek is bounded and does not suppress recovery forever", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(42);
  f.audio.seeking = true;
  f.audio.fire("seeking");
  await f.clock.advance(15000);
  assert.ok(
    f.audio.loadCalls > 1,
    "seek state must not indefinitely reset the progress watchdog",
  );
  assert.ok(f.audio.currentTime >= 42 && f.audio.currentTime < 42.3);
  assert.equal(f.audio.seeking, false);
  f.controller.dispose();
});

test("repeated playing events cannot mask a clock that never advances", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(31);
  for (let i = 0; i < 8; i++) {
    f.audio.fire("playing");
    await f.clock.advance(1000);
  }
  assert.ok(
    f.audio.loadCalls > 1,
    "only an advancing clock may reset progress timeout",
  );
  assert.equal(f.audio.currentTime, 31.1);
  f.controller.dispose();
});

test("a failed metadata reload preserves the original position for the second recovery", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(67.5);
  f.audio.autoMetadata = false;
  await f.clock.advance(6999);
  assert.equal(f.audio.loadCalls, 3);
  assert.equal(f.state().recovering, true);
  f.audio.autoMetadata = true;
  await f.clock.advance(1);
  assert.equal(f.audio.loadCalls, 5);
  assert.equal(
    f.audio.currentTime,
    67.6,
    "the first load must not erase the second attempt's resume position",
  );
  assert.equal(f.state().recovering, false);
  assert.equal(f.state().playing, true);
  assert.deepEqual(f.errors, []);
  f.controller.dispose();
});

test("a resolved native play promise without clock progress cannot report successful recovery", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(55);
  f.audio.advanceAfterRecoveryPlay = false;
  const result = f.controller.recover().then(
    () => ({ succeeded: true }),
    (error) => ({ succeeded: false, error }),
  );
  await flush();
  assert.equal(f.state().recovering, true);
  assert.equal(f.state().playing, false);
  await f.clock.advance(1000);
  const settled = await result;
  assert.equal(settled.succeeded, false);
  assert.match(settled.error.message, /超时/);
  assert.equal(f.audio.currentTime, 55);
  assert.equal(f.state().recovering, false);
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().playing, false);
  assert.equal(f.errors.length, 1);
  f.controller.dispose();
});

test("a six second media stall recovers at most twice, then reports a manual action", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.controller.seek(22);
  await f.clock.advance(6000);
  assert.equal(f.audio.loadCalls, 3);
  assert.equal(f.audio.currentTime, 22.1);
  await f.clock.advance(6000);
  assert.equal(f.audio.loadCalls, 5);
  await f.clock.advance(20000);
  assert.equal(f.audio.loadCalls, 5);
  assert.equal(f.state().playing, false);
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().recovering, false);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /恢复声音/);
  f.controller.dispose();
});

test("two failed automatic starts stop without selecting another track", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.playPlans.push(
    () => Promise.reject(new Error("device failed")),
    () => Promise.reject(new Error("device failed again")),
  );
  await f.clock.advance(6000);
  assert.equal(f.audio.playCalls, 3);
  assert.equal(f.audio.loadCalls, 5);
  assert.equal(f.state().playing, false);
  assert.equal(f.state().buffering, false);
  assert.equal(f.state().recovering, false);
  assert.equal(f.ended(), 0);
  assert.equal(f.errors.length, 1);
  f.controller.dispose();
});

test("an unsolicited pause recovers once; a user pause during recovery cancels it", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.interrupt();
  await flush();
  assert.equal(f.audio.loadCalls, 3);
  assert.equal(f.state().playing, true);
  f.audio.interrupt();
  await flush();
  assert.equal(f.audio.loadCalls, 3);
  assert.equal(f.state().playing, false);
  assert.equal(f.errors.length, 1);
  f.controller.dispose();

  const g = setup();
  await g.controller.playSource("https://example.test/song-a.mp3");
  const pending = deferred();
  g.audio.playPlans.push(() => pending.promise);
  g.audio.interrupt();
  await flush();
  assert.equal(g.state().recovering, true);
  g.controller.pause();
  pending.resolve();
  await flush();
  assert.equal(g.audio.paused, true);
  assert.equal(g.state().recovering, false);
  assert.equal(g.state().buffering, false);
  assert.deepEqual(g.errors, []);
  g.controller.dispose();
});

test("metadata recovery times out, and reset/dispose cancel in-flight work and timers", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.autoMetadata = false;
  const result = assert.rejects(f.controller.recover(), /超时/);
  await f.clock.advance(1000);
  await result;
  assert.equal(f.state().recovering, false);
  assert.equal(f.state().buffering, false);
  assert.equal(f.errors.length, 1);
  const canceled = f.controller.recover();
  f.controller.reset();
  await canceled;
  assert.equal(f.audio.src, "");
  assert.equal(f.state().playing, false);
  assert.equal(f.state().position, 0);
  const disposed = f.controller.playSource("https://example.test/song-b.mp3");
  f.controller.dispose();
  await disposed;
  await flush();
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.audio.paused, true);
  assert.equal(f.errors.length, 1);
});

test("only a genuine, single ended event invokes queue handling", async () => {
  const f = setup();
  await f.controller.playSource("https://example.test/song-a.mp3");
  f.audio.fire("ended");
  assert.equal(f.ended(), 0);
  f.audio.ended = true;
  f.audio.paused = true;
  f.audio.fire("ended");
  f.audio.fire("ended");
  await f.clock.advance(15000);
  assert.equal(f.ended(), 1);
  assert.equal(f.audio.loadCalls, 1);
  assert.equal(f.state().playing, false);
  f.controller.dispose();
});
