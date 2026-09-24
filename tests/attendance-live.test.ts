import { test } from "node:test";
import assert from "node:assert/strict";
import {
  subscribeSheet,
  broadcastFrame,
  joinPresence,
  leavePresence,
  presenceNames,
  sseFrame,
  SSE_PING,
} from "../src/lib/attendance-live.ts";

test("broadcastFrame delivers only to that event's subscribers", () => {
  const got1: string[] = [];
  const got2: string[] = [];
  const off1 = subscribeSheet("e1", (f) => got1.push(f));
  const off2 = subscribeSheet("e2", (f) => got2.push(f));
  broadcastFrame("e1", "hello");
  assert.deepEqual(got1, ["hello"]);
  assert.deepEqual(got2, []);
  off1();
  off2();
});

test("unsubscribe stops delivery and is idempotent", () => {
  const got: string[] = [];
  const off = subscribeSheet("e3", (f) => got.push(f));
  off();
  off();
  broadcastFrame("e3", "late");
  assert.deepEqual(got, []);
});

test("presence tracks names per connection", () => {
  joinPresence("e4", "c1", "Ann");
  joinPresence("e4", "c2", "Bo");
  joinPresence("e4", "c3", "Ann");
  assert.deepEqual(presenceNames("e4"), ["Ann", "Bo", "Ann"]);
  leavePresence("e4", "c1");
  leavePresence("e4", "c1");
  assert.deepEqual(presenceNames("e4"), ["Bo", "Ann"]);
  assert.deepEqual(presenceNames("nobody"), []);
  leavePresence("e4", "c2");
  leavePresence("e4", "c3");
});

test("sseFrame formats one event with JSON data; ping is a comment", () => {
  assert.equal(sseFrame("snapshot", { a: 1 }), 'event: snapshot\ndata: {"a":1}\n\n');
  assert.equal(SSE_PING, ": ping\n\n");
});

test("registry is shared across module instances (globalThis)", async () => {
  // A query string makes Node evaluate the module a second time (TS can't type it).
  const spec = "../src/lib/attendance-live.ts?second-instance";
  const other = await import(spec);
  assert.notEqual(other.subscribeSheet, subscribeSheet); // really a second evaluation
  const got: string[] = [];
  const off = subscribeSheet("e5", (f) => got.push(f));
  other.broadcastFrame("e5", "cross");
  assert.deepEqual(got, ["cross"]);
  off();
});
