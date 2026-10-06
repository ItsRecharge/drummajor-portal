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

// Wait before the next try after `attempts` failed tries: 1, 2, 4, 8, then 15 min.
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 15) * 60_000;
}
