// Emails students who were marked Absent — once per event — with a personal
// appeal link. Runs on the every-minute tick, but only for sheets saved at
// least ABSENCE_GRACE_MINUTES ago, so leadership can fix a slip first
// (re-saving restarts the clock). Failures are retried on a later tick.
import { prisma } from "@/lib/prisma";
import { appBaseUrl, getSmtpConfig, sendMail } from "@/lib/email";
import { getBandName } from "@/lib/leadership";
import { randomToken } from "@/lib/tokens";
import { absenceEmail } from "@/lib/absence-emails";
import { getConflictPolicy } from "@/lib/attendance-policy";
import { AttendanceStatus, EventAudience } from "@/generated/prisma/client";
import { formatEventWhen } from "@/app/(app)/events/event-dates";

export const ABSENCE_GRACE_MINUTES = 30;
const BATCH_PER_TICK = 40;
const SEND_SPACING_MS = 250;

export function appealUrl(token: string): string {
  return `${appBaseUrl()}/appeal/${token}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function processAbsenceEmails(now = new Date()): Promise<{ sent: number; failed: number }> {
  const cutoff = new Date(now.getTime() - ABSENCE_GRACE_MINUTES * 60_000);
  const due = await prisma.attendanceRecord.findMany({
    where: {
      status: AttendanceStatus.ABSENT,
      absenceEmailedAt: null,
      event: { audience: EventAudience.BAND, attendanceTakenAt: { lte: cutoff } },
    },
    include: { contact: true, event: true },
    orderBy: { updatedAt: "asc" },
    take: BATCH_PER_TICK,
  });
  if (due.length === 0) return { sent: 0, failed: 0 };
  // Nothing to do until email is set up; the records stay queued.
  if (!(await getSmtpConfig())) return { sent: 0, failed: 0 };

  const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
  let sent = 0;
  let failed = 0;
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
      await sendMail({ to: r.contact.email, subject: mail.subject, html: mail.html });
      await prisma.attendanceRecord.update({ where: key, data: { absenceEmailedAt: now } });
      sent++;
    } catch (err) {
      failed++;
      console.error(`[absence] email to ${r.contact.email} for "${r.event.title}" failed:`, err);
    }
    await sleep(SEND_SPACING_MS);
  }
  return { sent, failed };
}
