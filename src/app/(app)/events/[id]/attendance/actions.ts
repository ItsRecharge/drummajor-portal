"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/form";
import { countStatuses, parseAttendanceForm } from "@/lib/attendance";
import { getGroupContacts } from "@/lib/attendance-data";
import { Role, EventAudience } from "@/generated/prisma/client";

// Replaces the whole sheet: one row per contact in the chosen group, so
// switching groups drops rows for students no longer expected.
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

  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany({ where: { eventId } }),
    prisma.attendanceRecord.createMany({
      data: [...statuses].map(([contactId, status]) => ({ eventId, contactId, status })),
    }),
    prisma.event.update({
      where: { id: eventId },
      data: { attendanceGroupId: group.id, attendanceTakenAt: new Date() },
    }),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "ATTENDANCE_SAVED",
    target: event.title,
    metadata: { group: group.name, ...counts },
  });

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/attendance");
  return {
    success: true,
    message: `Saved — ${counts.present} present, ${counts.late} late, ${counts.excused} excused, ${counts.absent} absent.`,
  };
}
