"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { eventSchema } from "@/lib/validation";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { enqueueAnnouncement } from "@/lib/announce";
import { notifyAll, notifyUsers } from "@/lib/notify";
import { escapeHtml } from "@/lib/sanitize";
import { appBaseUrl, dmEventEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { emailLeadership, getBandName, getLeadershipUsers } from "@/lib/leadership";
import { Role, EventAudience, type Event } from "@/generated/prisma/client";
import { eventLocalDate, formatEventWhen } from "./event-dates";

const EVENT_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

function pathFor(audience: EventAudience): string {
  return audience === EventAudience.DRUM_MAJORS ? "/dm-events" : "/events";
}

// "Email everyone" on a band event creates an announcement to Everyone
// (reusing the send queue) plus an in-app notification for the leadership.
async function announceBandEvent(actorId: string, event: Event): Promise<void> {
  await ensureBuiltInGroups();
  const everyone = await prisma.group.findUnique({ where: { name: EVERYONE } });
  if (!everyone) return;

  const when = formatEventWhen(event.date, event.time);
  const bodyHtml =
    `<p><strong>${escapeHtml(event.title)}</strong></p><p>${escapeHtml(when)}</p>` +
    (event.location ? `<p>${escapeHtml(event.location)}</p>` : "") +
    (event.description ? `<p>${escapeHtml(event.description)}</p>` : "");
  const announcement = await prisma.announcement.create({
    data: { subject: `Event: ${event.title}`, bodyHtml, authorId: actorId },
  });
  await prisma.announcementRecipientGroup.create({
    data: { announcementId: announcement.id, groupId: everyone.id },
  });
  await enqueueAnnouncement(announcement.id, {});
  await notifyAll("EVENT", { title: event.title, when }, actorId);
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
  const notify = audience === EventAudience.DRUM_MAJORS ? true : formData.get("notify") === "on";
  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      location: parsed.data.location || null,
      date: parsed.data.date,
      time: parsed.data.time || null,
      audience,
      notify,
      createdById: actor.id,
    },
  });
  await logAudit({ actorId: actor.id, action: "EVENT_CREATED", target: event.title, metadata: { audience } });

  if (audience === EventAudience.DRUM_MAJORS) await inviteDrumMajors(actor, event);
  else if (notify) await announceBandEvent(actor.id, event);

  revalidatePath("/events");
  revalidatePath("/dm-events");
  revalidatePath("/dashboard");
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
  redirect(pathFor(event.audience));
}
