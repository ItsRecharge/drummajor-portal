"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/form";
import { countStatuses, parseAttendanceForm } from "@/lib/attendance";
import { getGroupContacts } from "@/lib/attendance-data";
import { sendMail } from "@/lib/email";
import { getBandName } from "@/lib/leadership";
import { getConflictPolicy } from "@/lib/event-comms";
import { appealDecisionEmail } from "@/lib/absence-emails";
import { AppealStatus, AttendanceStatus, EventAudience, Role } from "@/generated/prisma/client";
import { formatEventWhen } from "../../event-dates";

// Saves the sheet as a diff against what's stored: new rows are created,
// changed statuses updated, students no longer in the chosen class list
// removed. Existing rows keep their absence-email/appeal state, so re-saving
// never re-emails anyone. Clearing an absence auto-approves a pending appeal.
export async function saveAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const eventId = String(formData.get("eventId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");

  const [event, group] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.group.findUnique({ where: { id: groupId } }),
  ]);
  if (!event || event.audience !== EventAudience.BAND) return { error: "Event not found." };
  if (!group || !group.builtIn) return { error: "Pick a class list." };

  const contacts = await getGroupContacts(group);
  const statuses = parseAttendanceForm(formData, contacts.map((c) => c.id));
  const counts = countStatuses(statuses.values());
  const now = new Date();

  const existing = await prisma.attendanceRecord.findMany({
    where: { eventId },
    include: { appeal: { select: { id: true, status: true } }, contact: { select: { name: true, email: true } } },
  });
  const current = new Map(existing.map((r) => [r.contactId, r]));
  const toCreate: { eventId: string; contactId: string; status: AttendanceStatus }[] = [];
  const updates = [];
  const cleared: { appealId: string; name: string; email: string }[] = [];
  for (const [contactId, status] of statuses) {
    const row = current.get(contactId);
    if (!row) {
      toCreate.push({ eventId, contactId, status });
    } else if (row.status !== status) {
      updates.push(
        prisma.attendanceRecord.update({ where: { eventId_contactId: { eventId, contactId } }, data: { status } }),
      );
      if (status !== AttendanceStatus.ABSENT && row.appeal?.status === AppealStatus.PENDING) {
        cleared.push({ appealId: row.appeal.id, name: row.contact.name, email: row.contact.email });
      }
    }
  }
  const removed = existing.filter((r) => !statuses.has(r.contactId)).map((r) => r.contactId);

  await prisma.$transaction([
    ...(toCreate.length ? [prisma.attendanceRecord.createMany({ data: toCreate })] : []),
    ...updates,
    ...(removed.length ? [prisma.attendanceRecord.deleteMany({ where: { eventId, contactId: { in: removed } } })] : []),
    ...(cleared.length
      ? [
          prisma.absenceAppeal.updateMany({
            where: { id: { in: cleared.map((c) => c.appealId) } },
            data: { status: AppealStatus.APPROVED, decidedAt: now, decidedById: actor.id },
          }),
        ]
      : []),
    prisma.event.update({
      where: { id: eventId },
      data: { attendanceGroupId: group.id, attendanceTakenAt: now },
    }),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "ATTENDANCE_SAVED",
    target: event.title,
    metadata: { group: group.name, ...counts },
  });

  // Students whose pending appeal was settled by this save hear back too.
  if (cleared.length) {
    const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
    const when = formatEventWhen(event.date, event.time);
    after(async () => {
      for (const c of cleared) {
        const mail = appealDecisionEmail({ studentName: c.name, title: event.title, when, approved: true, policy, bandName });
        await sendMail({ to: c.email, subject: mail.subject, html: mail.html }).catch((err) =>
          console.error(`[attendance] decision email to ${c.email} failed:`, err),
        );
      }
    });
  }

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/attendance");
  return {
    success: true,
    message: `Saved — ${counts.present} present, ${counts.late} late, ${counts.excused} excused, ${counts.absent} absent.`,
  };
}
