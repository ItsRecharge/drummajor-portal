import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";
import { LEADERSHIP_ROLES } from "@/lib/roles";

// "Leadership" = every portal user with the ADMIN or DRUM_MAJOR role. They are
// auto-cc'd on every announcement and emailed about new tasks, ideas and
// drum-major events. Portal users are distinct from roster Contacts, so these
// helpers are how the two audiences meet.

export type LeadershipUser = { id: string; name: string; email: string };

// Band name for email mastheads (single-row Organization).
export async function getBandName(): Promise<string | undefined> {
  const org = await prisma.organization.findFirst({ select: { bandName: true } });
  return org?.bandName;
}

export async function getLeadershipUsers(): Promise<LeadershipUser[]> {
  return prisma.user.findMany({
    where: { role: { in: [...LEADERSHIP_ROLES] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

export async function getLeadershipEmails(): Promise<string[]> {
  const users = await getLeadershipUsers();
  return [...new Set(users.map((u) => u.email.toLowerCase()))];
}

// Email every leader except (optionally) the actor. Best-effort: one failure
// never blocks the others, and nothing is thrown — callers fire-and-forget.
export async function emailLeadership(opts: {
  subject: string;
  html: string;
  exceptUserId?: string;
  icalEvent?: { method: string; content: string };
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    const users = await getLeadershipUsers();
    for (const u of users) {
      if (opts.exceptUserId && u.id === opts.exceptUserId) continue;
      try {
        await sendMail({ to: u.email, subject: opts.subject, html: opts.html, icalEvent: opts.icalEvent });
        sent++;
      } catch (err) {
        failed++;
        console.error(`[leadership] email to ${u.email} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[leadership] emailLeadership failed:", err);
  }
  return { sent, failed };
}
