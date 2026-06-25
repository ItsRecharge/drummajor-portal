import { randomBytes } from "node:crypto";

// High-entropy URL-safe tokens for invites, email verification, and password
// resets. Stored directly in their tables; looked up on the matching route.
export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export function expiresInHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function expiresInDays(days: number): Date {
  return expiresInHours(days * 24);
}

// Wraps the clock read so callers (incl. server components) don't trip the
// react-hooks purity lint on a direct Date.now() in render.
export function isExpired(date: Date): boolean {
  return date.getTime() < Date.now();
}
