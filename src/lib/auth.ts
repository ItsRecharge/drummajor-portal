import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession, ACTOR_COOKIE } from "@/lib/session";
import type { Role, User } from "@/generated/prisma/client";

// Auth state for the current request. `user` is the EFFECTIVE user (the person
// the portal is acting as — the target while impersonating). `actor` is the real
// logged-in account. When not impersonating they're the same. Role checks gate on
// the effective user, so an admin impersonating a DM sees exactly the DM's portal.

export type AuthState = {
  user: User;
  actor: User;
  impersonating: boolean;
};

export async function getAuth(): Promise<AuthState | null> {
  const session = await getSession();
  if (!session) return null;

  const c = await cookies();
  const actorToken = c.get(ACTOR_COOKIE)?.value;
  if (actorToken) {
    const actorSession = await prisma.session.findUnique({
      where: { sessionToken: actorToken },
      include: { user: true },
    });
    if (actorSession) {
      return { user: session.user, actor: actorSession.user, impersonating: true };
    }
  }
  return { user: session.user, actor: session.user, impersonating: false };
}

export async function getCurrentUser(): Promise<User | null> {
  return (await getAuth())?.user ?? null;
}

export async function requireAuth(): Promise<AuthState> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}

export async function requireRole(...roles: Role[]): Promise<AuthState> {
  const auth = await requireAuth();
  if (!roles.includes(auth.user.role)) redirect("/dashboard");
  return auth;
}
