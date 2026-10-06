// Batching + retry rules shared by the announcement queue and absence emails.
// Gmail answers a burst with temporary 4xx replies ("try again later", "too many
// login attempts"); those are retried on a later tick instead of being recorded
// as failures. A 5xx (bad address) is final.

// Recipients per one-minute tick, and the pause between messages in a tick.
export const MAIL_BATCH_SIZE = 20;
export const MAIL_SPACING_MS = 1000;
// Total tries per recipient before a temporary error is recorded as a failure.
export const MAX_ATTEMPTS = 5;

const TRANSIENT_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET"]);
const TRANSIENT_TEXT = /\b4\.\d\.\d\b|try again later|too many|rate limit|temporar/i;

export function isTransientSmtpError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { responseCode?: unknown; code?: unknown; message?: unknown };
  if (typeof e.responseCode === "number") return e.responseCode >= 400 && e.responseCode < 500;
  if (typeof e.code === "string" && TRANSIENT_CODES.has(e.code)) return true;
  return typeof e.message === "string" && TRANSIENT_TEXT.test(e.message);
}

// A delivery that would otherwise be recorded as failed (a 5xx, or temporary
// errors that ran out of tries) gets one last automatic try this long after.
export const FINAL_RETRY_MS = 5 * 60_000;

export type FailureStep =
  | { kind: "retry"; attempts: number; delayMs: number }
  | { kind: "fail"; attempts: number };

// What to do after a send fails. `prevAttempts` is the delivery's tries before
// this one. Temporary errors back off until MAX_ATTEMPTS; then (or on any
// permanent error) one final try in FINAL_RETRY_MS, marked by storing
// MAX_ATTEMPTS so the next failure is final.
export function failureStep(prevAttempts: number, transient: boolean): FailureStep {
  const attempts = prevAttempts + 1;
  if (transient && attempts < MAX_ATTEMPTS) return { kind: "retry", attempts, delayMs: retryDelayMs(attempts) };
  if (attempts <= MAX_ATTEMPTS) return { kind: "retry", attempts: MAX_ATTEMPTS, delayMs: FINAL_RETRY_MS };
  return { kind: "fail", attempts };
}

// Wait before the next try after `attempts` failed tries: 1, 2, 4, 8, then 15 min.
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 15) * 60_000;
}
