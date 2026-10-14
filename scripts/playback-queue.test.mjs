import test from "node:test";
import assert from "node:assert/strict";
import { createQueueFailurePolicy } from "../src/playback-queue.ts";

test("failed tracks are skipped once and a completely failed queue stops after one pass", () => {
  const policy = createQueueFailurePolicy();
  const queue = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 1 }];
  assert.equal(policy.next(queue, 2, false).id, 3);
  assert.equal(policy.next(queue, 3, false).id, 1);
  assert.equal(policy.next(queue, 1, false), undefined);
  policy.reset();
  assert.equal(policy.next(queue, 1, false).id, 2);
});

test("empty, single-track and removed-current queues do not retry the failed track", () => {
  const policy = createQueueFailurePolicy();
  assert.equal(policy.next([], 1, false), undefined);
  assert.equal(policy.next([{ id: 1 }, { id: 1 }], 1, false), undefined);
  assert.equal(policy.next([{ id: 2 }, { id: 3 }], 1, false).id, 2);
});

test("shuffle uses only unvisited candidates and respects queue changes", () => {
  const policy = createQueueFailurePolicy();
  assert.equal(policy.next([{ id: 1 }, { id: 2 }], 1, true).id, 2);
  assert.equal(policy.next([{ id: 1 }, { id: 2 }, { id: 3 }], 2, true).id, 3);
  assert.equal(policy.next([{ id: 1 }, { id: 2 }], 3, true), undefined);
});
