// Sliding-window rate limiter for the public check-in action. In-process on
// globalThis (same reasoning as attendance-live.ts: one `next start` process,
// and server actions and route handlers must share it). Pure so it runs under
// node:test with an injected clock.

export type RateRule = { limit: number; windowMs: number };
export type RateHit = { allowed: boolean; retryAfterMs: number };
export type RateLimiter = {
  hit(key: string, rule: RateRule, nowMs?: number): RateHit;
  reset(): void;
};

// Per ticket and per phone: stops someone guessing names off a scan (or a
// reload). Per IP: only a
// flood cap — the whole band sits behind one school Wi-Fi address.
export const TICKET_RULE: RateRule = { limit: 10, windowMs: 60_000 };
export const IP_RULE: RateRule = { limit: 300, windowMs: 60_000 };

const SWEEP_EVERY = 1000;
const SWEEP_AGE_MS = 10 * 60_000;

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  let ops = 0;
  const sweep = (t: number) => {
    for (const [key, arr] of hits) {
      if (arr.length === 0 || arr[arr.length - 1] + SWEEP_AGE_MS <= t) hits.delete(key);
    }
  };
  return {
    hit(key, rule, nowMs) {
      const t = nowMs ?? now();
      const cutoff = t - rule.windowMs;
      const arr = (hits.get(key) ?? []).filter((ts) => ts > cutoff);
      if (arr.length >= rule.limit) {
        hits.set(key, arr);
        return { allowed: false, retryAfterMs: arr[0] + rule.windowMs - t };
      }
      arr.push(t);
      hits.set(key, arr);
      if (++ops % SWEEP_EVERY === 0) sweep(t);
      return { allowed: true, retryAfterMs: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

const KEY = "__dmpCheckInLimiter";
const g = globalThis as unknown as Record<string, RateLimiter | undefined>;
export const checkInLimiter: RateLimiter = (g[KEY] ??= createRateLimiter());
