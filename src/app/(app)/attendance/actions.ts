"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/form";
import { sendMail } from "@/lib/email";
import { getBandName } from "@/lib/leadership";
import { getConflictPolicy } from "@/lib/event-comms";
import { appealDecisionEmail } from "@/lib/absence-emails";
import { AppealStatus, AttendanceStatus, Role } from "@/generated/prisma/client";
import { formatEventWhen } from "../events/event-dates";

// Approve (record → Excused) or deny a pending appeal; the student is emailed.
export async function decideAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const appealId = String(formData.get("appealId") ?? "");
  const approved = formData.get("decision") === "APPROVED";

  const appeal = await prisma.absenceAppeal.findUnique({
    where: { id: appealId },
    include: { record: { include: { contact: true, event: true } } },
  });
  if (!appeal) return { error: "Appeal not found." };
  if (appeal.status !== AppealStatus.PENDING) return { error: "This appeal was already decided." };

  const { contact, event } = appeal.record;
  const now = new Date();
  await prisma.$transaction([
    prisma.absenceAppeal.update({
      where: { id: appealId },
      data: { status: approved ? AppealStatus.APPROVED : AppealStatus.DENIED, decidedAt: now, decidedById: actor.id },
    }),
    ...(approved
      ? [
          prisma.attendanceRecord.update({
            where: { eventId_contactId: { eventId: appeal.eventId, contactId: appeal.contactId } },
            data: { status: AttendanceStatus.EXCUSED },
          }),
        ]
      : []),
  ]);
  await logAudit({
    actorId: actor.id,
    action: approved ? "APPEAL_APPROVED" : "APPEAL_DENIED",
    target: `${contact.name} — ${event.title}`,
  });

  const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
  const mail = appealDecisionEmail({
    studentName: contact.name,
    title: event.title,
    when: formatEventWhen(event.date, event.time),
    approved,
    policy,
    bandName,
  });
  after(() =>
    sendMail({ to: contact.email, subject: mail.subject, html: mail.html }).catch((err) =>
      console.error(`[appeal] decision email to ${contact.email} failed:`, err),
    ),
  );

  revalidatePath("/attendance");
  revalidatePath(`/events/${event.id}/attendance`);
  return { success: true, message: approved ? `Excused ${contact.name}.` : `Denied ${contact.name}'s appeal.` };
}
