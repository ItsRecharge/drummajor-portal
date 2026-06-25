import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  ACTOR_COOKIE,
  createSessionRecord,
  cookieOptions,
} from "@/lib/session";

// Impersonation swaps the dm_session cookie to a fresh session for the target user
// while stashing the admin's real token in dm_actor. Start/stop are recorded in
// SecurityLog ONLY — never AuditLog — so actions taken while impersonating stay
// accountable without polluting the public audit trail (docs/plan.md Security Model).
// Callers MUST verify the actor is an admin before calling startImpersonation.

export async function startImpersonation(adminUserId: string, targetUserId: string): Promise<void> {
  const c = await cookies();
  const adminToken = c.get(SESSION_COOKIE)?.value;
  if (!adminToken) throw new Error("No active admin session");
  if (adminUserId === targetUserId) throw new Error("Cannot impersonate yourself");

  const targetToken = await createSessionRecord(targetUserId);
  c.set(SESSION_COOKIE, targetToken, cookieOptions());
  c.set(ACTOR_COOKIE, adminToken, cookieOptions());

  await prisma.securityLog.create({
    data: { actorId: adminUserId, targetId: targetUserId, action: "IMPERSONATION_START" },
  });
}

export async function stopImpersonation(): Promise<void> {
  const c = await cookies();
  const adminToken = c.get(ACTOR_COOKIE)?.value;
  const targetToken = c.get(SESSION_COOKIE)?.value;
  if (!adminToken) return; // not impersonating

  // Resolve ids for the stop log before tearing the impersonation session down.
  const [adminSession, targetSession] = await Promise.all([
    prisma.session.findUnique({ where: { sessionToken: adminToken }, select: { userId: true } }),
    targetToken
      ? prisma.session.findUnique({ where: { sessionToken: targetToken }, select: { userId: true } })
      : Promise.resolve(null),
  ]);

  if (targetToken) {
    await prisma.session.delete({ where: { sessionToken: targetToken } }).catch(() => {});
  }
  c.set(SESSION_COOKIE, adminToken, cookieOptions());
  c.delete(ACTOR_COOKIE);

  if (adminSession) {
    await prisma.securityLog.create({
      data: {
        actorId: adminSession.userId,
        targetId: targetSession?.userId ?? null,
        action: "IMPERSONATION_STOP",
      },
    });
  }
}
