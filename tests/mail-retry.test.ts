import { test } from "node:test";
import assert from "node:assert/strict";
import { FINAL_RETRY_MS, MAX_ATTEMPTS, failureStep, isTransientSmtpError, retryDelayMs } from "../src/lib/mail-retry.ts";

const smtpErr = (responseCode: number, message = "x") => Object.assign(new Error(message), { responseCode });
const codeErr = (code: string) => Object.assign(new Error("socket"), { code });

test("4xx SMTP replies are transient", () => {
  for (const c of [421, 450, 451, 452, 454]) assert.equal(isTransientSmtpError(smtpErr(c)), true, String(c));
});

test("5xx SMTP replies are permanent", () => {
  assert.equal(isTransientSmtpError(smtpErr(550, "5.1.1 user unknown")), false);
  assert.equal(isTransientSmtpError(smtpErr(553)), false);
});

test("connection-level failures are transient", () => {
  for (const c of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET"]) {
    assert.equal(isTransientSmtpError(codeErr(c)), true, c);
  }
});

test("Gmail throttling text is transient even without a code", () => {
  assert.equal(isTransientSmtpError(new Error("454 4.7.0 Too many login attempts, please try again later")), true);
  assert.equal(isTransientSmtpError(new Error("Daily user sending limit exceeded; rate limit")), true);
});

test("unknown errors are permanent", () => {
  assert.equal(isTransientSmtpError(new Error("Invalid recipient")), false);
  assert.equal(isTransientSmtpError("boom"), false);
  assert.equal(isTransientSmtpError(null), false);
});

test("retry delay doubles from one minute and caps at 15", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((a) => retryDelayMs(a) / 60_000),
    [1, 2, 4, 8, 15, 15],
  );
});

test("max attempts is a small positive number", () => {
  assert.ok(MAX_ATTEMPTS >= 3 && MAX_ATTEMPTS <= 10);
});

test("permanent error: one retry after five minutes, then failed", () => {
  assert.equal(FINAL_RETRY_MS, 5 * 60_000);
  const first = failureStep(0, false);
  assert.deepEqual(first, { kind: "retry", attempts: MAX_ATTEMPTS, delayMs: FINAL_RETRY_MS });
  assert.equal(failureStep(first.attempts, false).kind, "fail");
});

test("temporary errors back off, then get the five-minute final retry, then fail", () => {
  const steps = [];
  let attempts = 0;
  for (let i = 0; i < 10; i++) {
    const s = failureStep(attempts, true);
    steps.push(s.kind === "retry" ? s.delayMs / 60_000 : "fail");
    if (s.kind === "fail") break;
    attempts = s.attempts;
  }
  assert.deepEqual(steps, [1, 2, 4, 8, 5, "fail"]);
});

test("a permanent error after temporary ones still gets exactly one final retry", () => {
  const s = failureStep(2, false);
  assert.deepEqual(s, { kind: "retry", attempts: MAX_ATTEMPTS, delayMs: FINAL_RETRY_MS });
  assert.equal(failureStep(s.attempts, true).kind, "fail");
});
