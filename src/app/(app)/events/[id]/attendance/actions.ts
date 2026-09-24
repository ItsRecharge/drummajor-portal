"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/form";
import { countStatuses, isAttendanceStatus, type AttendanceStatus, type SheetSnapshot } from "@/lib/attendance";
import { broadcastSheet, getEventRoster, loadSheetSnapshot } from "@/lib/attendance-data";
import { processAbsenceEmails } from "@/lib/absence";
import { sendMail } from "@/lib/email";
import { getBandName } from "@/lib/leadership";
import { getConflictPolicy } from "@/lib/attendance-policy";
import { appealDecisionEmail } from "@/lib/absence-emails";
import { todayUtcInZone } from "@/lib/event-schedule";
import { AppealStatus, EventAudience, Role, type Event } from "@/generated/prisma/client";
import { formatEventWhen } from "../../event-dates";

// Every tap on the sheet saves at once and returns the fresh snapshot, which the
// client applies before dropping its optimistic mark. No revalidatePath here:
// that would make the browser refetch the whole page on every tap. Nothing is
// emailed until a drum major publishes (see publishAttendanceAction).
export type MarkResult = { ok: true; snapshot: SheetSnapshot } | { ok: false; error: string };

const SHEET_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

async function loadBandEvent(eventId: string): Promise<Event | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  return event && event.audience === EventAudience.BAND ? event : null;
}

type Cleared = { appealId: string; name: string; email: string };

// Marking a student anything but Absent settles their pending appeal.
async function pendingAppeals(eventId: string, contactIds: string[], status: AttendanceStatus): Promise<Cleared[]> {
  if (status === "ABSENT" || contactIds.length === 0) return [];
  const appeals = await prisma.absenceAppeal.findMany({
    where: { eventId, contactId: { in: contactIds }, status: AppealStatus.PENDING },
    include: { record: { include: { contact: { select: { name: true, email: true } } } } },
  });
  return appeals.map((a) => ({ appealId: a.id, name: a.record.contact.name, email: a.record.contact.email }));
}

function approveAppeals(cleared: Cleared[], actorId: string, now: Date) {
  if (cleared.length === 0) return [];
  return [
    prisma.absenceAppeal.updateMany({
      where: { id: { in: cleared.map((c) => c.appealId) } },
      data: { status: AppealStatus.APPROVED, decidedAt: now, decidedById: actorId },
    }),
  ];
}

// Students whose pending appeal was settled by a mark hear back too.
function emailAppealDecisions(event: Event, cleared: Cleared[]): void {
  if (cleared.length === 0) return;
  after(async () => {
    const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
    const when = formatEventWhen(event.date, event.time);
    for (const c of cleared) {
      const mail = appealDecisionEmail({ studentName: c.name, title: event.title, when, approved: true, policy, bandName });
      await sendMail({ to: c.email, subject: mail.subject, html: mail.html }).catch((err) =>
        console.error(`[attendance] decision email to ${c.email} failed:`, err),
      );
    }
  });
}

async function finish(eventId: string): Promise<MarkResult> {
  const snapshot = await loadSheetSnapshot(eventId);
  if (!snapshot) return { ok: false, error: "Event not found." };
  await broadcastSheet(eventId, snapshot);
  return { ok: true, snapshot };
}

export async function markAttendanceAction(
  eventId: string,
  contactId: string,
  status: AttendanceStatus,
): Promise<MarkResult> {
  const { user: actor } = await requireRole(...SHEET_ROLES);
  if (!isAttendanceStatus(status)) return { ok: false, error: "Unknown status." };
  const event = await loadBandEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const key = { eventId_contactId: { eventId, contactId } };
  const { contacts } = await getEventRoster(eventId);
  const expected =
    contacts.some((c) => c.id === contactId) || (await prisma.attendanceRecord.findUnique({ where: key })) !== null;
  if (!expected) return { ok: false, error: "That student isn't expected at this event." };

  const cleared = await pendingAppeals(eventId, [contactId], status);
  const now = new Date();
  await prisma.$transaction([
    prisma.attendanceRecord.upsert({ where: key, create: { eventId, contactId, status }, update: { status } }),
    ...approveAppeals(cleared, actor.id, now),
    prisma.event.update({ where: { id: eventId }, data: { attendanceTakenAt: now } }),
  ]);
  emailAppealDecisions(event, cleared);
  return finish(eventId);
}

export async function markAllAction(eventId: string, status: AttendanceStatus): Promise<MarkResult> {
  const { user: actor } = await requireRole(...SHEET_ROLES);
  if (!isAttendanceStatus(status)) return { ok: false, error: "Unknown status." };
  const event = await loadBandEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const [{ contacts }, existing] = await Promise.all([
    getEventRoster(eventId),
    prisma.attendanceRecord.findMany({ where: { eventId }, select: { contactId: true } }),
  ]);
  const have = new Set(existing.map((r) => r.contactId));
  const missing = contacts.filter((c) => !have.has(c.id)).map((c) => ({ eventId, contactId: c.id, status }));
  const cleared = await pendingAppeals(eventId, [...have], status);
  const now = new Date();
  await prisma.$transaction([
    ...(missing.length ? [prisma.attendanceRecord.createMany({ data: missing, skipDuplicates: true })] : []),
    prisma.attendanceRecord.updateMany({ where: { eventId }, data: { status } }),
    ...approveAppeals(cleared, actor.id, now),
    prisma.event.update({ where: { id: eventId }, data: { attendanceTakenAt: now } }),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "ATTENDANCE_MARKED_ALL",
    target: event.title,
    metadata: { status, students: missing.length + have.size },
  });
  emailAppealDecisions(event, cleared);
  return finish(eventId);
}

// Publishing finalizes the sheet: everyone still unmarked becomes Absent (that
// is what "expected" means for the season summary), and the absence emails go
// out. Two drum majors confirming at once can't both win — the updateMany is
// guarded on attendancePublishedAt being null.
export async function publishAttendanceAction(eventId: string): Promise<ActionState> {
  const { user: actor } = await requireRole(...SHEET_ROLES);
  const event = await loadBandEvent(eventId);
  if (!event) return { error: "Event not found." };
  if (!event.attendanceTakenAt) return { error: "Mark attendance before publishing." };
  const now = new Date();
  if (event.date.getTime() > todayUtcInZone(now).getTime()) {
    return { error: "This event hasn't happened yet." };
  }

  const [{ contacts }, existing] = await Promise.all([
    getEventRoster(eventId),
    prisma.attendanceRecord.findMany({ where: { eventId }, select: { contactId: true } }),
  ]);
  const have = new Set(existing.map((r) => r.contactId));
  const missing = contacts
    .filter((c) => !have.has(c.id))
    .map((c) => ({ eventId, contactId: c.id, status: "ABSENT" as const }));

  const updated = await prisma.$transaction(async (tx) => {
    if (missing.length) await tx.attendanceRecord.createMany({ data: missing, skipDuplicates: true });
    return tx.event.updateMany({
      where: { id: eventId, attendancePublishedAt: null },
      data: { attendancePublishedAt: now, attendancePublishedById: actor.id },
    });
  });
  if (updated.count === 0) {
    await broadcastSheet(eventId);
    return { success: true, message: "Already published." };
  }

  const records = await prisma.attendanceRecord.findMany({ where: { eventId }, select: { status: true } });
  const counts = countStatuses(records.map((r) => r.status as AttendanceStatus));
  await logAudit({ actorId: actor.id, action: "ATTENDANCE_PUBLISHED", target: event.title, metadata: { ...counts } });
  await broadcastSheet(eventId);
  // Send now rather than on the next minute tick.
  after(() =>
    processAbsenceEmails().catch((err) => console.error("[attendance] absence emails after publish failed:", err)),
  );

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/attendance");
  return {
    success: true,
    message: `Published — ${counts.absent} absence email${counts.absent === 1 ? "" : "s"} going out.`,
  };
}
