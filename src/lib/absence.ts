// Emails students who were marked Absent — once per event — with a personal
// appeal link. Only published sheets count, so an unpublished sheet never
// emails anyone. Runs on the every-minute tick and right after a publish;
// failures are retried on a later tick.
import { prisma } from "@/lib/prisma";
import { appBaseUrl, buildBatchTransport, fromHeader, getSmtpConfig } from "@/lib/email";
import { MAIL_BATCH_SIZE, MAIL_SPACING_MS, isTransientSmtpError } from "@/lib/mail-retry";
import { getBandName } from "@/lib/leadership";
import { randomToken } from "@/lib/tokens";
import { absenceEmail } from "@/lib/absence-emails";
import { getConflictPolicy } from "@/lib/attendance-policy";
import { broadcastSheet } from "@/lib/attendance-data";
import { AttendanceStatus, EventAudience } from "@/generated/prisma/client";
import { formatEventWhen } from "@/app/(app)/events/event-dates";

// The publish action and the cron tick can both call processAbsenceEmails; the
// flag lives on globalThis so separate server bundles share it.
const lock = globalThis as unknown as { __dmpAbsenceRunning?: boolean };

export function appealUrl(token: string): string {
  return `${appBaseUrl()}/appeal/${token}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function processAbsenceEmails(now = new Date()): Promise<{ sent: number; failed: number }> {
  if (lock.__dmpAbsenceRunning) return { sent: 0, failed: 0 };
  lock.__dmpAbsenceRunning = true;
  try {
    return await sendDue(now);
  } finally {
    lock.__dmpAbsenceRunning = false;
  }
}

async function sendDue(now: Date): Promise<{ sent: number; failed: number }> {
  const due = await prisma.attendanceRecord.findMany({
    where: {
      status: AttendanceStatus.ABSENT,
      absenceEmailedAt: null,
      event: { audience: EventAudience.BAND, attendancePublishedAt: { not: null } },
    },
    include: { contact: true, event: true },
    orderBy: { updatedAt: "asc" },
    take: MAIL_BATCH_SIZE,
  });
  if (due.length === 0) return { sent: 0, failed: 0 };
  // Nothing to do until email is set up; the records stay queued.
  const cfg = await getSmtpConfig();
  if (!cfg) return { sent: 0, failed: 0 };

  const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
  let sent = 0;
  let failed = 0;
  // One connection (one Gmail login) for the whole batch.
  const transport = buildBatchTransport(cfg);
  try {
    for (const r of due) {
      const key = { eventId_contactId: { eventId: r.eventId, contactId: r.contactId } };
      try {
        let token = r.appealToken;
        if (!token) {
          token = randomToken();
          await prisma.attendanceRecord.update({ where: key, data: { appealToken: token } });
        }
        const mail = absenceEmail({
          studentName: r.contact.name,
          title: r.event.title,
          when: formatEventWhen(r.event.date, r.event.time),
          appealUrl: appealUrl(token),
          policy,
          bandName,
        });
        await transport.sendMail({ from: fromHeader(cfg), to: r.contact.email, subject: mail.subject, html: mail.html });
        await prisma.attendanceRecord.update({ where: key, data: { absenceEmailedAt: now } });
        sent++;
      } catch (err) {
        failed++;
        console.error(`[absence] email to ${r.contact.email} for "${r.event.title}" failed:`, err);
        // Gmail is throttling — leave the rest queued for the next tick.
        if (isTransientSmtpError(err)) break;
      }
      await sleep(MAIL_SPACING_MS);
    }
  } finally {
    transport.close();
  }
  // Open sheets show an envelope on each emailed student.
  for (const eventId of new Set(due.map((r) => r.eventId))) {
    await broadcastSheet(eventId).catch((err) => console.error("[absence] broadcast failed:", err));
  }
  return { sent, failed };
}
