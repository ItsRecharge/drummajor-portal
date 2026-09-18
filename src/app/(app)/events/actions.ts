"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { eventSchema } from "@/lib/validation";
import { notifyUsers } from "@/lib/notify";
import { appBaseUrl, dmEventEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { emailLeadership, getBandName, getLeadershipUsers } from "@/lib/leadership";
import { announceEventIfSoon } from "@/lib/event-comms";
import { Role, EventAudience, type Event } from "@/generated/prisma/client";
import { eventLocalDate, formatEventWhen } from "./event-dates";

const EVENT_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

function pathFor(audience: EventAudience): string {
  return audience === EventAudience.DRUM_MAJORS ? "/dm-events" : "/events";
}

// The class list expected at a band event. Only built-in groups are accepted;
// anything else means Everyone (stored as null).
async function expectedGroupId(groupId: string | undefined): Promise<string | null> {
  if (!groupId) return null;
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, builtIn: true } });
  return group?.builtIn ? group.id : null;
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
  const attendanceGroupId = audience === EventAudience.BAND ? await expectedGroupId(parsed.data.groupId) : null;
  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      location: parsed.data.location || null,
      date: parsed.data.date,
      time: parsed.data.time || null,
      audience,
      // DM events always notify; band events only when within a week (set below).
      notify: audience === EventAudience.DRUM_MAJORS,
      attendanceGroupId,
      createdById: actor.id,
    },
  });
  await logAudit({ actorId: actor.id, action: "EVENT_CREATED", target: event.title, metadata: { audience } });

  if (audience === EventAudience.DRUM_MAJORS) await inviteDrumMajors(actor, event);
  else await announceEventIfSoon(event);

  revalidatePath("/events");
  revalidatePath("/dm-events");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(pathFor(audience));
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const id = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return;
  await prisma.event.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "EVENT_DELETED", target: event.title });
  revalidatePath("/events");
  revalidatePath("/dm-events");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(pathFor(event.audience));
}
