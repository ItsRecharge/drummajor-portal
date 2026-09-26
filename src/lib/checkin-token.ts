// Rotating QR tokens and short-lived tickets for QR check-in. Pure apart from
// node:crypto (no Prisma, no env) so it runs under node:test; the server-side
// secret comes from ./checkin-secret.ts.
//
// Token: HMAC(secret, `${eventId}:${window}`) where window = floor(now / 20 s).
// The QR page re-renders every window; the public page accepts the current and
// the previous window, so a screenshot of the code is dead within 40 s.
//
// Ticket: `${expiresAt}.${HMAC(secret, `ticket:${eventId}:${expiresAt}`)}`,
// minted when a valid token is scanned and good for 5 minutes, so a slow
// typist doesn't have to rescan.
import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const TOKEN_PERIOD_MS = 20_000;
export const TICKET_TTL_MS = 5 * 60_000;

const TOKEN_LEN = 32;

// A key of its own, derived from the app's master key so nothing new has to be
// configured on the server.
export function deriveCheckInSecret(masterKey: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, "dmp-checkin", "checkin-token-v1", 32));
}

export function windowIndex(nowMs: number, periodMs = TOKEN_PERIOD_MS): number {
  return Math.floor(nowMs / periodMs);
}

export function windowEndsAt(nowMs: number, periodMs = TOKEN_PERIOD_MS): number {
  return (windowIndex(nowMs, periodMs) + 1) * periodMs;
}

function mac(secret: Buffer, message: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function makeToken(secret: Buffer, eventId: string, window: number): string {
  return mac(secret, `${eventId}:${window}`).slice(0, TOKEN_LEN);
}

export function verifyToken(
  secret: Buffer,
  eventId: string,
  token: string,
  nowMs: number,
  periodMs = TOKEN_PERIOD_MS,
): boolean {
  if (typeof token !== "string" || token.length !== TOKEN_LEN) return false;
  const w = windowIndex(nowMs, periodMs);
  return equal(token, makeToken(secret, eventId, w)) || equal(token, makeToken(secret, eventId, w - 1));
}

export function makeTicket(secret: Buffer, eventId: string, expiresAtMs: number): string {
  const exp = Math.floor(expiresAtMs);
  return `${exp}.${mac(secret, `ticket:${eventId}:${exp}`)}`;
}

export function verifyTicket(secret: Buffer, eventId: string, ticket: string, nowMs: number): boolean {
  if (typeof ticket !== "string") return false;
  const parts = ticket.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  if (!/^\d{1,16}$/.test(expStr)) return false;
  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp) || exp <= nowMs) return false;
  return equal(sig, mac(secret, `ticket:${eventId}:${exp}`));
}

// Only the hash of the dm_device cookie is stored.
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
