import { test } from "node:test";
import assert from "node:assert/strict";
import { IP_RULE, TICKET_RULE, checkInLimiter, createRateLimiter } from "../src/lib/rate-limit.ts";

const rule = { limit: 3, windowMs: 1000 };

test("rules: 10 tries per ticket, 300 per IP, per minute", () => {
  assert.deepEqual(TICKET_RULE, { limit: 10, windowMs: 60_000 });
  assert.deepEqual(IP_RULE, { limit: 300, windowMs: 60_000 });
});

test("hit: allows up to the limit, then refuses with a retry hint", () => {
  const rl = createRateLimiter(() => 0);
  assert.deepEqual(rl.hit("k", rule, 0), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(rl.hit("k", rule, 100), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(rl.hit("k", rule, 200), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(rl.hit("k", rule, 300), { allowed: false, retryAfterMs: 700 });
});

test("hit: the window slides — the oldest hit frees exactly one slot", () => {
  const rl = createRateLimiter(() => 0);
  rl.hit("k", rule, 0);
  rl.hit("k", rule, 500);
  rl.hit("k", rule, 900);
  assert.equal(rl.hit("k", rule, 999).allowed, false);
  assert.equal(rl.hit("k", rule, 1000).allowed, true); // the t=0 hit aged out
  assert.equal(rl.hit("k", rule, 1001).allowed, false);
});

test("hit: keys are independent", () => {
  const rl = createRateLimiter(() => 0);
  for (let i = 0; i < 3; i++) rl.hit("a", rule, i);
  assert.equal(rl.hit("a", rule, 10).allowed, false);
  assert.equal(rl.hit("b", rule, 10).allowed, true);
});

test("hit: uses the injected clock when no time is passed", () => {
  let t = 0;
  const rl = createRateLimiter(() => t);
  rl.hit("k", rule);
  rl.hit("k", rule);
  rl.hit("k", rule);
  assert.equal(rl.hit("k", rule).allowed, false);
  t = 1000;
  assert.equal(rl.hit("k", rule).allowed, true);
});

test("reset clears everything", () => {
  const rl = createRateLimiter(() => 0);
  for (let i = 0; i < 3; i++) rl.hit("k", rule, 0);
  rl.reset();
  assert.equal(rl.hit("k", rule, 0).allowed, true);
});

test("checkInLimiter is shared across module instances (globalThis)", async () => {
  const spec = "../src/lib/rate-limit.ts?second-instance";
  const other = await import(spec);
  assert.notEqual(other.createRateLimiter, createRateLimiter);
  checkInLimiter.reset();
  for (let i = 0; i < 3; i++) checkInLimiter.hit("shared", rule, 0);
  assert.equal(other.checkInLimiter.hit("shared", rule, 0).allowed, false);
  checkInLimiter.reset();
});
