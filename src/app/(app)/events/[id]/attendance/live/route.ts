import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isLeadership } from "@/lib/roles";
import { EventAudience } from "@/generated/prisma/client";
import {
  broadcastFrame,
  joinPresence,
  leavePresence,
  presenceNames,
  sseFrame,
  SSE_PING,
  subscribeSheet,
} from "@/lib/attendance-live";
import { loadSheetSnapshot } from "@/lib/attendance-data";

// Server-Sent Events for one roll-call sheet: a full snapshot on connect and
// after every change, who else has it open, and a keep-alive comment. Route
// handlers sit outside the (app) layout, so auth is checked here. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md.
export const dynamic = "force-dynamic";

const PING_MS = 25_000;

function presenceFrame(eventId: string): string {
  return sseFrame("presence", { names: presenceNames(eventId) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth || !isLeadership(auth.user.role)) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { audience: true } });
  if (!event || event.audience !== EventAudience.BAND) return new Response("Not found", { status: 404 });
  const snapshot = await loadSheetSnapshot(id);
  if (!snapshot) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const connId = crypto.randomUUID();
  const viewer = auth.user.name;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribeSheet(id, send);
      const ping = setInterval(() => send(SSE_PING), PING_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        leavePresence(id, connId);
        broadcastFrame(id, presenceFrame(id));
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", cleanup);

      joinPresence(id, connId, viewer);
      send("retry: 3000\n\n");
      send(sseFrame("snapshot", snapshot));
      // Everyone on this sheet (this tab included) learns who's here.
      broadcastFrame(id, presenceFrame(id));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps `next start`'s compression middleware off the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
