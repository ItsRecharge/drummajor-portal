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
import { checkInAnchorSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { randomToken } from "@/lib/tokens";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { appealUrl } from "@/lib/absence";
import { attendanceChangedEmail } from "@/lib/absence-emails";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { closeCheckIn, loadCheckInSession, openCheckIn, type CheckInSession } from "@/lib/checkin-data";
import { AppealStatus, EventAudience, Role, type Event } from "@/generated/prisma/client";
import { formatEventWhen } from "../../event-dates";

// Every tap on the sheet saves at once and returns the fresh snapshot, which the
// client applies before dropping its optimistic mark. No revalidatePath here:
// that would make the browser refetch the whole page on every tap. Nothing is
// emailed until a drum major publishes (see publishAttendanceAction).
export type MarkResult = { ok: true; snapshot: SheetSnapshot } | { ok: false; error: string };

const SHEET_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

// A published sheet only changes through overrideAttendanceAction.
const PUBLISHED_ERROR = "This sheet is published. Use Override attendance to change it.";

async function loadBandEvent(eventId: string): Promise<Event | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  return event && event.audience === EventAudience.BAND && event.attendanceRequired ? event : null;
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
  if (event.attendancePublishedAt) return { ok: false, error: PUBLISHED_ERROR };

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
  if (event.attendancePublishedAt) return { ok: false, error: PUBLISHED_ERROR };

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
    // Publishing ends QR check-in for the event.
    await tx.event.updateMany({
      where: { id: eventId, checkInOpenedAt: { not: null }, checkInClosedAt: null },
      data: { checkInClosedAt: now },
    });
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

// Changing a published sheet: the drum major re-enters their password, the
// change is audited under their name, and every student whose status changed
// is emailed (old → new; a new Absent gets an appeal link). Changed rows get
// absenceEmailedAt so the absence worker never sends a second notice. While
// impersonating, the real account's password and name are what count.
export type OverrideChange = { contactId: string; status: AttendanceStatus };

const PASSWORD_RULE = { limit: 5, windowMs: 10 * 60_000 };
const limiterSlot = globalThis as unknown as { __dmpOverrideLimiter?: RateLimiter };
const passwordLimiter = (limiterSlot.__dmpOverrideLimiter ??= createRateLimiter());

export async function overrideAttendanceAction(
  eventId: string,
  changes: OverrideChange[],
  password: string,
): Promise<MarkResult & { message?: string }> {
  const { actor } = await requireRole(...SHEET_ROLES);
  const event = await loadBandEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (!event.attendancePublishedAt) return { ok: false, error: "Publish the sheet first." };
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, error: "Nothing to change." };
  if (changes.some((c) => typeof c?.contactId !== "string" || !isAttendanceStatus(c.status))) {
    return { ok: false, error: "Unknown status." };
  }

  if (!passwordLimiter.hit(actor.id, PASSWORD_RULE).allowed) {
    return { ok: false, error: "Too many tries. Wait a few minutes and try again." };
  }
  if (typeof password !== "string" || !(await verifyPassword(password, actor.passwordHash))) {
    await logAudit({ actorId: actor.id, action: "ATTENDANCE_OVERRIDE_DENIED", target: event.title, metadata: { by: actor.name } });
    return { ok: false, error: "Wrong password." };
  }

  // Last change per student wins; drop ones that don't change anything.
  const wanted = new Map(changes.map((c) => [c.contactId, c.status]));
  // Students added to a class list after publishing have no record; the sheet
  // shows them as Absent.
  const [records, { contacts }] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { eventId, contactId: { in: [...wanted.keys()] } },
      include: { contact: { select: { name: true, email: true } } },
    }),
    getEventRoster(eventId),
  ]);
  const have = new Set(records.map((r) => r.contactId));
  const rows = [
    ...records.map((r) => ({ ...r, status: r.status as AttendanceStatus })),
    ...contacts
      .filter((c) => wanted.has(c.id) && !have.has(c.id))
      .map((c) => ({
        contactId: c.id,
        status: "ABSENT" as AttendanceStatus,
        appealToken: null,
        contact: { name: c.name, email: c.email },
      })),
  ];
  const diffs = rows
    .filter((r) => wanted.get(r.contactId) !== r.status)
    .map((r) => ({ record: r, from: r.status, to: wanted.get(r.contactId)! }));
  if (diffs.length === 0) return { ok: false, error: "Nothing changed." };

  const now = new Date();
  const toCleared = new Map<AttendanceStatus, string[]>();
  for (const d of diffs) toCleared.set(d.to, [...(toCleared.get(d.to) ?? []), d.record.contactId]);
  const cleared = (
    await Promise.all([...toCleared].map(([status, ids]) => pendingAppeals(eventId, ids, status)))
  ).flat();
  // A new Absent needs an appeal link; reuse the one they already have.
  const tokens = new Map(diffs.map((d) => [d.record.contactId, d.record.appealToken ?? (d.to === "ABSENT" ? randomToken() : null)]));

  await prisma.$transaction([
    ...diffs.map((d) =>
      prisma.attendanceRecord.upsert({
        where: { eventId_contactId: { eventId, contactId: d.record.contactId } },
        create: { eventId, contactId: d.record.contactId, status: d.to, absenceEmailedAt: now, appealToken: tokens.get(d.record.contactId) },
        update: { status: d.to, absenceEmailedAt: now, appealToken: tokens.get(d.record.contactId) },
      }),
    ),
    ...approveAppeals(cleared, actor.id, now),
    prisma.event.update({ where: { id: eventId }, data: { attendanceTakenAt: now } }),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "ATTENDANCE_OVERRIDDEN",
    target: event.title,
    metadata: {
      by: actor.name,
      changes: diffs.map((d) => ({
        student: d.record.contact.name,
        from: ATTENDANCE_LABELS[d.from],
        to: ATTENDANCE_LABELS[d.to],
      })),
    },
  });

  after(async () => {
    const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
    const when = formatEventWhen(event.date, event.time);
    for (const d of diffs) {
      const token = tokens.get(d.record.contactId);
      const mail = attendanceChangedEmail({
        studentName: d.record.contact.name,
        title: event.title,
        when,
        from: d.from,
        to: d.to,
        appealUrl: d.to === "ABSENT" && token ? appealUrl(token) : undefined,
        policy,
        bandName,
      });
      await sendMail({ to: d.record.contact.email, subject: mail.subject, html: mail.html }).catch((err) =>
        console.error(`[attendance] override email to ${d.record.contact.email} failed:`, err),
      );
    }
  });

  revalidatePath("/attendance");
  const res = await finish(eventId);
  return res.ok
    ? { ...res, message: `Saved — ${diffs.length} student${diffs.length === 1 ? "" : "s"} emailed.` }
    : res;
}

// ---------------------------------------------------------------------------
// QR self check-in (beta): open/close from the drum major's QR page. Opening
// captures their phone as the geofence anchor. Like taps, no revalidatePath —
// the sheet and the QR page learn about it over the live stream.
// ---------------------------------------------------------------------------

export type CheckInActionResult = { ok: true; session: CheckInSession } | { ok: false; error: string };

async function finishCheckIn(eventId: string): Promise<CheckInActionResult> {
  await broadcastSheet(eventId);
  const session = await loadCheckInSession(eventId);
  return session ? { ok: true, session } : { ok: false, error: "Event not found." };
}

export async function openCheckInAction(
  eventId: string,
  anchor: { lat: number; lng: number; accuracyM: number },
): Promise<CheckInActionResult> {
  const { user: actor } = await requireRole(...SHEET_ROLES);
  const event = await loadBandEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = checkInAnchorSchema.safeParse(anchor);
  if (!parsed.success) return { ok: false, error: "That location doesn't look right. Try again." };
  const r = await openCheckIn(eventId, actor.id, parsed.data);
  if (!r.ok) return r;
  await logAudit({ actorId: actor.id, action: "CHECKIN_OPENED", target: event.title, metadata: { ...parsed.data } });
  return finishCheckIn(eventId);
}

export async function closeCheckInAction(eventId: string): Promise<CheckInActionResult> {
  const { user: actor } = await requireRole(...SHEET_ROLES);
  const event = await loadBandEvent(eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const wasOpen = await closeCheckIn(eventId);
  if (wasOpen) {
    const checkIns = await prisma.checkIn.count({ where: { eventId } });
    await logAudit({ actorId: actor.id, action: "CHECKIN_CLOSED", target: event.title, metadata: { checkIns } });
  }
  return finishCheckIn(eventId);
}
