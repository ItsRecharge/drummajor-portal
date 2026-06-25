"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { handoffNoteSchema } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize";
import { Role } from "@/generated/prisma/client";

const HANDOFF_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

export async function createHandoffNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...HANDOFF_ROLES);
  const parsed = parseForm(handoffNoteSchema, formData);
  if (!parsed.ok) return parsed.state;

  await prisma.handoffNote.create({
    data: {
      year: parsed.data.year,
      category: parsed.data.category,
      title: parsed.data.title,
      bodyHtml: sanitizeHtml(parsed.data.bodyHtml),
      authorId: actor.id,
    },
  });
  await logAudit({ actorId: actor.id, action: "HANDOFF_NOTE_CREATED", target: parsed.data.title });
  revalidatePath("/handoff");
  return { success: true, message: "Handoff note saved." };
}

export async function deleteHandoffNoteAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...HANDOFF_ROLES);
  const id = String(formData.get("noteId") ?? "");
  const note = await prisma.handoffNote.findUnique({ where: { id } });
  if (!note) return;
  // Author or admin may remove a handoff note.
  if (note.authorId !== actor.id && actor.role !== Role.ADMIN) return;
  await prisma.handoffNote.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "HANDOFF_NOTE_DELETED", target: note.title });
  revalidatePath("/handoff");
}
