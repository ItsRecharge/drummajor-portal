"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseForm, type ActionState } from "@/lib/form";
import { appealSchema } from "@/lib/validation";
import { notifyAll } from "@/lib/notify";
import { emailLeadership, getBandName } from "@/lib/leadership";
import { appBaseUrl } from "@/lib/email";
import { appealSubmittedEmail } from "@/lib/absence-emails";
import { getConflictPolicy } from "@/lib/attendance-policy";
import { AttendanceStatus } from "@/generated/prisma/client";
import { formatEventWhen } from "@/app/(app)/events/event-dates";

// Public: a student appeals via the personal link from their absence email.
// One appeal per absence; leadership gets a bell + an email to review it.
export async function submitAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(appealSchema, formData);
  if (!parsed.ok) return parsed.state;

  const record = await prisma.attendanceRecord.findUnique({
    where: { appealToken: parsed.data.token },
    include: { contact: true, event: true, appeal: true },
  });
  if (!record) return { error: "This link isn't valid." };
  if (record.status !== AttendanceStatus.ABSENT) return { error: "This absence has already been cleared." };
  if (record.appeal) return { error: "You've already appealed this absence." };

  await prisma.absenceAppeal.create({
    data: { eventId: record.eventId, contactId: record.contactId, reason: parsed.data.reason },
  });

  const when = formatEventWhen(record.event.date, record.event.time);
  await notifyAll("APPEAL", { student: record.contact.name, title: record.event.title, when });
  const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
  const mail = appealSubmittedEmail({
    studentName: record.contact.name,
    title: record.event.title,
    when,
    reason: parsed.data.reason,
    reviewUrl: `${appBaseUrl()}/attendance`,
    policy,
    bandName,
  });
  after(() => emailLeadership({ subject: mail.subject, html: mail.html }));

  return { success: true, message: "Appeal sent. A drum major will review it and you'll get an email either way." };
}
