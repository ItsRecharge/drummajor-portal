"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { announcementSchema, templateSchema } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { enqueueAnnouncement, approveAnnouncement } from "@/lib/announce";
import { notifyAll } from "@/lib/notify";
import { Role, AnnouncementStatus } from "@/generated/prisma/client";

const COMPOSE_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

// Create-or-update a DRAFT announcement from the composer, including its recipient
// groups and attached music. Editing is only allowed while still a draft.
async function upsertDraft(
  formData: FormData,
  authorId: string,
): Promise<{ ok: true; id: string; scheduledAt: Date | null } | { ok: false; state: ActionState }> {
  const parsed = parseForm(announcementSchema, formData);
  if (!parsed.ok) return { ok: false, state: parsed.state };

  const bodyHtml = sanitizeHtml(parsed.data.bodyHtml);
  if (!bodyHtml) return { ok: false, state: { fieldErrors: { bodyHtml: "Write a message" } } };

  const groupIds = formData.getAll("groupIds").map(String).filter(Boolean);
  if (groupIds.length === 0) return { ok: false, state: { error: "Select at least one recipient group." } };
  const musicIds = formData.getAll("musicIds").map(String).filter(Boolean);

  const id = String(formData.get("announcementId") ?? "");
  const scheduledAt = parsed.data.scheduledAt ?? null;

  let announcementId = id;
  if (id) {
    const existing = await prisma.announcement.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return { ok: false, state: { error: "Announcement not found." } };
    if (existing.status !== AnnouncementStatus.DRAFT) {
      return { ok: false, state: { error: "Only drafts can be edited." } };
    }
    await prisma.announcement.update({
      where: { id },
      data: { subject: parsed.data.subject, bodyHtml, scheduledAt },
    });
  } else {
    const created = await prisma.announcement.create({
      data: { subject: parsed.data.subject, bodyHtml, authorId, scheduledAt },
    });
    announcementId = created.id;
  }

  await prisma.announcementRecipientGroup.deleteMany({ where: { announcementId } });
  await prisma.announcementRecipientGroup.createMany({
    data: groupIds.map((groupId) => ({ announcementId, groupId })),
    skipDuplicates: true,
  });
  await prisma.announcementMusic.deleteMany({ where: { announcementId } });
  if (musicIds.length > 0) {
    await prisma.announcementMusic.createMany({
      data: musicIds.map((musicPieceId) => ({ announcementId, musicPieceId })),
      skipDuplicates: true,
    });
  }

  return { ok: true, id: announcementId, scheduledAt };
}

// Single composer action; the clicked button supplies `intent`.
// "send"/"schedule" route through enqueueAnnouncement, which lands in
// PENDING_APPROVAL automatically when the org requires approval.
export async function composeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...COMPOSE_ROLES);
  const intent = String(formData.get("intent") ?? "draft");

  if (intent === "schedule" && !formData.get("scheduledAt")) {
    return { fieldErrors: { scheduledAt: "Pick a date and time to schedule." } };
  }

  const result = await upsertDraft(formData, actor.id);
  if (!result.ok) return result.state;

  if (intent === "draft") {
    revalidatePath("/announcements");
    redirect("/announcements");
  }

  const { recipients } = await enqueueAnnouncement(result.id, {
    scheduledAt: intent === "schedule" ? result.scheduledAt : null,
  });
  await logAudit({
    actorId: actor.id,
    action: intent === "schedule" ? "ANNOUNCEMENT_SCHEDULED" : "ANNOUNCEMENT_SENT",
    target: result.id,
    metadata: { recipients },
  });
  await notifyAll("ANNOUNCEMENT", { subject: String(formData.get("subject") ?? "") }, actor.id);
  revalidatePath("/announcements");
  redirect(`/announcements/${result.id}`);
}

export async function approveAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(Role.ADMIN);
  const id = String(formData.get("announcementId") ?? "");
  await approveAnnouncement(id);
  await logAudit({ actorId: actor.id, action: "ANNOUNCEMENT_APPROVED", target: id });
  revalidatePath(`/announcements/${id}`);
  revalidatePath("/announcements");
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...COMPOSE_ROLES);
  const id = String(formData.get("announcementId") ?? "");
  await prisma.announcement.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "ANNOUNCEMENT_DELETED", target: id });
  revalidatePath("/announcements");
  redirect("/announcements");
}

export async function saveTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(...COMPOSE_ROLES);
  const subject = String(formData.get("subject") ?? "");
  const bodyHtml = sanitizeHtml(String(formData.get("bodyHtml") ?? ""));
  const parsed = templateSchema.safeParse({
    name: formData.get("templateName"),
    subject,
    bodyHtml,
  });
  if (!parsed.success) {
    return { fieldErrors: { templateName: parsed.error.issues[0]?.message ?? "Invalid template." } };
  }
  await prisma.announcementTemplate.create({ data: parsed.data });
  revalidatePath("/announcements/new");
  return { success: true, message: "Template saved." };
}
