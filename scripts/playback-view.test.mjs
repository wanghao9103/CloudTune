import test from "node:test";
import assert from "node:assert/strict";
import {
  createPlaybackViewStore,
  activeLyricIndex,
} from "../src/playback-view.ts";

test("display snapshots stay cached when unchanged and subscriptions clean up", () => {
  const clock = createPlaybackViewStore();
  let updates = 0;
  const unsubscribe = clock.subscribe(() => updates++);
  const initial = clock.getSnapshot();
  clock.update(0, 0);
  assert.equal(clock.getSnapshot(), initial);
  assert.equal(updates, 0);
  clock.update(12.5, 180);
  assert.deepEqual(clock.getSnapshot(), { position: 12.5, duration: 180 });
  const previous = clock.getSnapshot();
  clock.update(12.5);
  assert.equal(clock.getSnapshot(), previous);
  assert.equal(updates, 1);
  unsubscribe();
  clock.update(13);
  assert.equal(updates, 1);
});

test("hidden display stops notifications while preserving the latest real time", () => {
  const clock = createPlaybackViewStore();
  let updates = 0;
  clock.subscribe(() => updates++);
  clock.update(10, 180);
  clock.setVisible(false);
  for (let i = 1; i <= 100; i++) clock.update(10 + i / 4);
  assert.equal(updates, 1);
  assert.deepEqual(clock.getSnapshot(), { position: 35, duration: 180 });
  clock.setVisible(true);
  assert.equal(updates, 2);
  clock.setVisible(true);
  assert.equal(updates, 2);
  clock.update(0, 0);
  assert.deepEqual(clock.getSnapshot(), { position: 0, duration: 0 });
});

test("lyric index follows forwards and backwards seeks and simultaneous lines", () => {
  const lines = [{ time: 5 }, { time: 10 }, { time: 10 }, { time: 40 }];
  assert.equal(activeLyricIndex([], 10), -1);
  assert.equal(activeLyricIndex(lines, 4), -1);
  assert.equal(activeLyricIndex(lines, 10), 2);
  assert.equal(activeLyricIndex(lines, 120), 3);
  assert.equal(activeLyricIndex(lines, 7), 0);
});
