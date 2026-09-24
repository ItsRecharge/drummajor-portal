// In-process pub/sub for the live attendance sheet: one channel per event,
// frames are pre-formatted SSE text. Pure (no Prisma) so it runs under
// node:test. The registry lives on globalThis unconditionally: Next bundles
// route handlers and server actions as separate entries, and both must reach
// the same subscribers. The deployment is a single `next start` process (see
// scheduler.ts), so no external broker is needed.

type Listener = (frame: string) => void;
type Registry = {
  listeners: Map<string, Set<Listener>>;
  // eventId -> connectionId -> viewer name
  presence: Map<string, Map<string, string>>;
};

const KEY = "__dmpAttendanceLive";
const g = globalThis as unknown as Record<string, Registry | undefined>;
const registry: Registry = (g[KEY] ??= { listeners: new Map(), presence: new Map() });

// Returns an idempotent unsubscribe.
export function subscribeSheet(eventId: string, listener: Listener): () => void {
  let set = registry.listeners.get(eventId);
  if (!set) {
    set = new Set();
    registry.listeners.set(eventId, set);
  }
  set.add(listener);
  return () => {
    const s = registry.listeners.get(eventId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) registry.listeners.delete(eventId);
  };
}

export function broadcastFrame(eventId: string, frame: string): void {
  const set = registry.listeners.get(eventId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(frame);
    } catch (err) {
      console.error("[attendance-live] listener failed:", err);
    }
  }
}

export function joinPresence(eventId: string, connId: string, name: string): void {
  let conns = registry.presence.get(eventId);
  if (!conns) {
    conns = new Map();
    registry.presence.set(eventId, conns);
  }
  conns.set(connId, name);
}

export function leavePresence(eventId: string, connId: string): void {
  const conns = registry.presence.get(eventId);
  if (!conns) return;
  conns.delete(connId);
  if (conns.size === 0) registry.presence.delete(eventId);
}

export function presenceNames(eventId: string): string[] {
  return [...(registry.presence.get(eventId)?.values() ?? [])];
}

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_PING = ": ping\n\n";
