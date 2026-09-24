"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { eventSchema } from "@/lib/validation";
import { notifyAll, notifyUsers } from "@/lib/notify";
import { appBaseUrl, dmEventEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { emailLeadership, getBandName, getLeadershipUsers } from "@/lib/leadership";
import { announceIfToday } from "@/lib/event-comms";
import { normalizeGroupSelection } from "@/lib/groups";
import { broadcastSheet, getAttendanceGroups } from "@/lib/attendance-data";
import { Role, EventAudience, type Event } from "@/generated/prisma/client";
import { eventLocalDate, formatEventWhen } from "./event-dates";

const EVENT_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

function pathFor(audience: EventAudience): string {
  return audience === EventAudience.DRUM_MAJORS ? "/dm-events" : "/events";
}

// The class lists a band event expects, from the form's "Who's expected" chips.
// Only built-in lists count; Everyone stands alone.
async function expectedGroupIds(formData: FormData) {
  const groups = await getAttendanceGroups();
  return normalizeGroupSelection(formData.getAll("groupIds").map(String), groups);
}

function revalidateEventPages(eventId?: string): void {
  revalidatePath("/events");
  revalidatePath("/dm-events");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  if (eventId) revalidatePath(`/events/${eventId}/attendance`);
}

// Drum-major events always go to the leadership team: bell for everyone but
// the creator, and an email with a calendar invite for everyone (creator too,
// so it lands on their calendar).
async function inviteDrumMajors(actor: { id: string; name: string }, event: Event): Promise<void> {
  const when = formatEventWhen(event.date, event.time);
  const [leaders, bandName] = await Promise.all([getLeadershipUsers(), getBandName()]);
  await notifyUsers(
    leaders.filter((u) => u.id !== actor.id).map((u) => u.id),
    "DM_EVENT",
    { title: event.title, when },
  );
  const mail = dmEventEmail({
    title: event.title,
    when,
    location: event.location,
    description: event.description,
    creatorName: actor.name,
    bandName,
  });
  const ics = buildIcs({
    uid: `${event.id}@drummajor-portal`,
    title: event.title,
    description: event.description,
    location: event.location,
    date: eventLocalDate(event.date),
    time: event.time,
    url: `${appBaseUrl()}/dm-events`,
  });
  after(() => emailLeadership({ ...mail, icalEvent: { method: "REQUEST", content: ics } }));
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const parsed = parseForm(eventSchema, formData);
  if (!parsed.ok) return parsed.state;

  const audience = parsed.data.audience === "DRUM_MAJORS" ? EventAudience.DRUM_MAJORS : EventAudience.BAND;
  let groupIds: string[] = [];
  if (audience === EventAudience.BAND) {
    const sel = await expectedGroupIds(formData);
    if (!sel.ok) return { error: sel.error };
    groupIds = sel.ids;
  }
  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      location: parsed.data.location || null,
      date: parsed.data.date,
      time: parsed.data.time || null,
      audience,
      // DM events are invited at once. Band events are never emailed on creation
      // (the daily job sends the reminders); their "Emailed" badge comes from
      // EventNotice rows, not this flag.
      notify: audience === EventAudience.DRUM_MAJORS,
      groups: { create: groupIds.map((groupId) => ({ groupId })) },
      createdById: actor.id,
    },
  });
  await logAudit({ actorId: actor.id, action: "EVENT_CREATED", target: event.title, metadata: { audience } });

  if (audience === EventAudience.DRUM_MAJORS) {
    await inviteDrumMajors(actor, event);
  } else {
    await notifyAll("EVENT", { title: event.title, when: formatEventWhen(event.date, event.time) }, actor.id);
    await announceIfToday(event);
  }

  revalidateEventPages();
  redirect(pathFor(audience));
}

// Band events only. A new date restarts the reminder schedule; new class lists
// change who the open roll-call sheet expects.
export async function updateEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const id = String(formData.get("eventId") ?? "");
  const existing = await prisma.event.findUnique({
    where: { id },
    include: { groups: { select: { groupId: true } } },
  });
  if (!existing || existing.audience !== EventAudience.BAND) return { error: "Event not found." };

  const parsed = parseForm(eventSchema, formData);
  if (!parsed.ok) return parsed.state;
  const sel = await expectedGroupIds(formData);
  if (!sel.ok) return { error: sel.error };

  const dateChanged = existing.date.getTime() !== parsed.data.date.getTime();
  const before = existing.groups.map((g) => g.groupId).sort().join(",");
  const groupsChanged = before !== [...sel.ids].sort().join(",");

  await prisma.$transaction([
    prisma.event.update({
      where: { id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description?.trim() || null,
        location: parsed.data.location || null,
        date: parsed.data.date,
        time: parsed.data.time || null,
        groups: { deleteMany: {}, create: sel.ids.map((groupId) => ({ groupId })) },
      },
    }),
    ...(dateChanged ? [prisma.eventNotice.deleteMany({ where: { eventId: id } })] : []),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "EVENT_UPDATED",
    target: parsed.data.title,
    metadata: { dateChanged, groupsChanged },
  });
  if (groupsChanged) after(() => broadcastSheet(id));

  revalidateEventPages(id);
  redirect("/events");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const id = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return;
  await prisma.event.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "EVENT_DELETED", target: event.title });
  revalidateEventPages();
  redirect(pathFor(event.audience));
}
