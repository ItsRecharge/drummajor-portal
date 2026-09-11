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
      data: musicIds.map((libraryItemId) => ({ announcementId, libraryItemId })),
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
  // Server-side guard: only drafts are deletable. Anything queued or sent keeps
  // its delivery history (open counts) and can't be removed through the UI.
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { status: true } });
  if (!existing || existing.status !== AnnouncementStatus.DRAFT) {
    revalidatePath("/announcements");
    redirect("/announcements");
  }
  await prisma.announcement.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "ANNOUNCEMENT_DELETED", target: id });
  revalidatePath("/announcements");
  redirect("/announcements");
}

// Pull a scheduled (or approval-pending) announcement back to Drafts. Its
// not-yet-sent EmailDelivery rows are discarded; sending again re-creates them.
export async function cancelScheduledAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...COMPOSE_ROLES);
  const id = String(formData.get("announcementId") ?? "");
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { status: true } });
  const cancellable: AnnouncementStatus[] = [AnnouncementStatus.SCHEDULED, AnnouncementStatus.PENDING_APPROVAL];
  if (existing && cancellable.includes(existing.status)) {
    await prisma.$transaction([
      prisma.emailDelivery.deleteMany({ where: { announcementId: id, sentAt: null } }),
      prisma.announcement.update({
        where: { id },
        data: { status: AnnouncementStatus.DRAFT, scheduledAt: null },
      }),
    ]);
    await logAudit({ actorId: actor.id, action: "ANNOUNCEMENT_CANCELLED", target: id });
  }
  revalidatePath("/announcements");
  revalidatePath(`/announcements/${id}`);
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
  revalidatePath("/announcements/templates");
  return { success: true, message: "Template saved." };
}

export async function updateTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(...COMPOSE_ROLES);
  const id = String(formData.get("templateId") ?? "");
  const parsed = templateSchema.safeParse({
    name: formData.get("templateName"),
    subject: formData.get("subject"),
    bodyHtml: sanitizeHtml(String(formData.get("bodyHtml") ?? "")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === "name" ? "templateName" : String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: "Please fix the errors below." };
  }
  const existing = await prisma.announcementTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Template not found." };
  await prisma.announcementTemplate.update({ where: { id }, data: parsed.data });
  revalidatePath("/announcements/new");
  revalidatePath("/announcements/templates");
  redirect("/announcements/templates");
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...COMPOSE_ROLES);
  const id = String(formData.get("templateId") ?? "");
  const existing = await prisma.announcementTemplate.findUnique({ where: { id }, select: { name: true } });
  if (existing) {
    await prisma.announcementTemplate.delete({ where: { id } });
    await logAudit({ actorId: actor.id, action: "TEMPLATE_DELETED", target: existing.name });
  }
  revalidatePath("/announcements/new");
  revalidatePath("/announcements/templates");
  redirect("/announcements/templates");
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Stores an uploaded body image and returns its app-relative URL for the editor.
// The sanitizer only admits "/i/" and https img srcs, so this is the sole path
// for getting an uploaded image into an announcement.
export async function uploadImageAction(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireRole(...COMPOSE_ROLES);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  if (!IMAGE_MIMES.has(file.type)) return { error: "Use a PNG, JPEG, GIF, or WebP image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be 4 MB or smaller." };
  const data = new Uint8Array(await file.arrayBuffer());
  const img = await prisma.emailImage.create({ data: { mime: file.type, data } });
  return { url: `/i/${img.id}` };
}
