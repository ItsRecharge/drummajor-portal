import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Public (admin-visible) audit log. Impersonation is deliberately NOT recorded
// here — it goes to SecurityLog (see src/lib/impersonation.ts).
export async function logAudit(entry: {
  actorId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      metadata: entry.metadata,
    },
  });
}
