"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { eventSchema } from "@/lib/validation";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { enqueueAnnouncement } from "@/lib/announce";
import { notifyAll } from "@/lib/notify";
import { Role } from "@/generated/prisma/client";

const EVENT_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

// "Notify users?" on an event creates an announcement to Everyone (reusing the
// Stage 3 queue) plus an in-app notification for everyone.
async function announceEvent(
  authorId: string,
  event: { title: string; description: string | null; date: Date; time: string | null },
): Promise<void> {
  await ensureBuiltInGroups();
  const everyone = await prisma.group.findUnique({ where: { name: EVERYONE } });
  if (!everyone) return;

  const when = `${event.date.toLocaleDateString()}${event.time ? ` at ${event.time}` : ""}`;
  const bodyHtml = `<p><strong>${event.title}</strong></p><p>${when}</p>${
    event.description ? `<p>${event.description}</p>` : ""
  }`;
  const announcement = await prisma.announcement.create({
    data: { subject: `Event: ${event.title}`, bodyHtml, authorId },
  });
  await prisma.announcementRecipientGroup.create({
    data: { announcementId: announcement.id, groupId: everyone.id },
  });
  await enqueueAnnouncement(announcement.id, {});
  await notifyAll("EVENT", { title: event.title, when });
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const parsed = parseForm(eventSchema, formData);
  if (!parsed.ok) return parsed.state;

  const notify = formData.get("notify") === "on";
  const event = await prisma.event.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      date: parsed.data.date,
      time: parsed.data.time || null,
      notify,
    },
  });
  await logAudit({ actorId: actor.id, action: "EVENT_CREATED", target: event.title });
  if (notify) await announceEvent(actor.id, event);

  revalidatePath("/events");
  revalidatePath("/dashboard");
  redirect("/events");
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...EVENT_ROLES);
  const id = String(formData.get("eventId") ?? "");
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return;
  await prisma.event.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "EVENT_DELETED", target: event.title });
  revalidatePath("/events");
  redirect("/events");
}
