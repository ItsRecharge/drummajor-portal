import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isLeadership } from "@/lib/roles";
import { EventAudience } from "@/generated/prisma/client";
import { checkInSecret } from "@/lib/checkin-secret";
import { makeToken, windowEndsAt, windowIndex } from "@/lib/checkin-token";

// The current QR token for the drum major's display. The secret never leaves
// the server, so the page asks here each window. Route handlers sit outside
// the (app) layout, so auth is checked here (see live/route.ts).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth || !isLeadership(auth.user.role)) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { audience: true, checkInOpenedAt: true, checkInClosedAt: true },
  });
  if (!event || event.audience !== EventAudience.BAND) return new Response("Not found", { status: 404 });
  if (!event.checkInOpenedAt || event.checkInClosedAt) {
    return Response.json({ error: "closed" }, { status: 409, headers: NO_STORE });
  }
  const now = Date.now();
  return Response.json(
    { token: makeToken(checkInSecret(), id, windowIndex(now)), expiresAt: windowEndsAt(now), now },
    { headers: NO_STORE },
  );
}
