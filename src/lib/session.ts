import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Hand-rolled server-side sessions backed by the Session table (see docs/plan.md
// — Auth.js Credentials can't do real DB sessions). A high-entropy token lives in
// an HttpOnly cookie; every request validates it against the DB. This is what
// powers the active-session list, "log out other devices", and impersonation.

export const SESSION_COOKIE = "dm_session";
export const ACTOR_COOKIE = "dm_actor"; // holds the real admin token while impersonating

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACTIVITY_BUMP_MS = 5 * 60 * 1000; // throttle lastActiveAt writes

export type SessionWithUser = Prisma.SessionGetPayload<{ include: { user: true } }>;

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  };
}

// Creates a Session row and returns its token. Does NOT touch cookies, so it can
// be reused by impersonation (which sets cookies itself).
export async function createSessionRecord(userId: string): Promise<string> {
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      sessionToken: token,
      userAgent,
      ipAddress,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, cookieOptions());
}

// Log a user in: create the record and set the cookie. Call from Server Actions.
export async function createSession(userId: string): Promise<string> {
  const token = await createSessionRecord(userId);
  await setSessionCookie(token);
  return token;
}

// Validate the current cookie. Safe to call from Server Components (DB write only,
// no cookie mutation). Returns the session + user, or null.
export async function getSession(): Promise<SessionWithUser | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (Date.now() - session.lastActiveAt.getTime() > ACTIVITY_BUMP_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
      .catch(() => {});
  }
  return session;
}

// Log out the current device: delete the row and clear the cookie.
export async function destroyCurrentSession(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { sessionToken: token } }).catch(() => {});
  }
  c.delete(SESSION_COOKIE);
  c.delete(ACTOR_COOKIE);
}

export async function destroyOtherSessions(userId: string, keepToken: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId, NOT: { sessionToken: keepToken } },
  });
  return result.count;
}

export function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { lastActiveAt: "desc" },
  });
}
