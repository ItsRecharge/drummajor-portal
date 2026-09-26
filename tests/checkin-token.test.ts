import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TICKET_TTL_MS,
  TOKEN_PERIOD_MS,
  deriveCheckInSecret,
  hashDeviceToken,
  makeTicket,
  makeToken,
  verifyTicket,
  verifyToken,
  windowEndsAt,
  windowIndex,
} from "../src/lib/checkin-token.ts";

const secret = deriveCheckInSecret("dev-only-insecure-key-do-not-use-in-prod-0000000");
const other = deriveCheckInSecret("another-master-key-that-is-also-32-chars-long!!");

test("constants: 20 s rotation, 5 min ticket", () => {
  assert.equal(TOKEN_PERIOD_MS, 20_000);
  assert.equal(TICKET_TTL_MS, 300_000);
});

test("deriveCheckInSecret: 32 bytes, deterministic, key-dependent", () => {
  assert.equal(secret.length, 32);
  assert.deepEqual(secret, deriveCheckInSecret("dev-only-insecure-key-do-not-use-in-prod-0000000"));
  assert.notDeepEqual(secret, other);
});

test("windowIndex / windowEndsAt: 20 s buckets", () => {
  assert.equal(windowIndex(0), 0);
  assert.equal(windowIndex(19_999), 0);
  assert.equal(windowIndex(20_000), 1);
  assert.equal(windowEndsAt(0), 20_000);
  assert.equal(windowEndsAt(19_999), 20_000);
  assert.equal(windowEndsAt(20_000), 40_000);
  assert.equal(windowIndex(45_000, 10_000), 4);
});

test("makeToken: deterministic, URL-safe, differs per event and per window", () => {
  const t = makeToken(secret, "ev1", 100);
  assert.equal(t, makeToken(secret, "ev1", 100));
  assert.match(t, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(t, makeToken(secret, "ev2", 100));
  assert.notEqual(t, makeToken(secret, "ev1", 101));
  assert.notEqual(t, makeToken(other, "ev1", 100));
});

test("verifyToken: current and previous window pass; anything else fails", () => {
  const now = 1_000_000_000_000; // window 50_000_000
  const w = windowIndex(now);
  assert.ok(verifyToken(secret, "ev1", makeToken(secret, "ev1", w), now));
  assert.ok(verifyToken(secret, "ev1", makeToken(secret, "ev1", w - 1), now));
  assert.ok(!verifyToken(secret, "ev1", makeToken(secret, "ev1", w - 2), now));
  assert.ok(!verifyToken(secret, "ev1", makeToken(secret, "ev1", w + 1), now));
  assert.ok(!verifyToken(secret, "ev2", makeToken(secret, "ev1", w), now));
  assert.ok(!verifyToken(other, "ev1", makeToken(secret, "ev1", w), now));
  assert.ok(!verifyToken(secret, "ev1", "", now));
  assert.ok(!verifyToken(secret, "ev1", "short", now));
  assert.ok(!verifyToken(secret, "ev1", "x".repeat(32), now));
});

test("verifyToken: a token minted at 0 s is still good at 39 s and dead at 40 s", () => {
  const minted = makeToken(secret, "ev1", windowIndex(0));
  assert.ok(verifyToken(secret, "ev1", minted, 39_999));
  assert.ok(!verifyToken(secret, "ev1", minted, 40_000));
});

test("makeTicket / verifyTicket: valid until expiry, rejects tampering and other events", () => {
  const now = 1_700_000_000_000;
  const exp = now + TICKET_TTL_MS;
  const ticket = makeTicket(secret, "ev1", exp);
  assert.match(ticket, /^\d+\.[A-Za-z0-9_-]+$/);
  assert.ok(verifyTicket(secret, "ev1", ticket, now));
  assert.ok(verifyTicket(secret, "ev1", ticket, exp - 1));
  assert.ok(!verifyTicket(secret, "ev1", ticket, exp));
  assert.ok(!verifyTicket(secret, "ev2", ticket, now));
  assert.ok(!verifyTicket(other, "ev1", ticket, now));
  const [, mac] = ticket.split(".");
  assert.ok(!verifyTicket(secret, "ev1", `${exp + 60_000}.${mac}`, now)); // stretched expiry
  const bent = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
  assert.ok(!verifyTicket(secret, "ev1", `${exp}.${bent}`, now)); // bent mac
  assert.ok(!verifyTicket(secret, "ev1", "abc", now));
  assert.ok(!verifyTicket(secret, "ev1", "1.2.3", now));
  assert.ok(!verifyTicket(secret, "ev1", "", now));
});

test("hashDeviceToken: sha256 hex, deterministic", () => {
  const h = hashDeviceToken("abc");
  assert.match(h, /^[a-f0-9]{64}$/);
  assert.equal(h, hashDeviceToken("abc"));
  assert.notEqual(h, hashDeviceToken("abd"));
});
