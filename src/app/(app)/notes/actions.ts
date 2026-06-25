"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { noteSchema, noteCommentSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notify";
import { Role } from "@/generated/prisma/client";

const NOTE_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

export async function createNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...NOTE_ROLES);
  const parsed = parseForm(noteSchema, formData);
  if (!parsed.ok) return parsed.state;

  // New notes are scattered near the top-left so they don't all stack exactly.
  await prisma.note.create({
    data: {
      text: parsed.data.text,
      color: parsed.data.color || "#fff3a0",
      category: parsed.data.category || null,
      anonymous: parsed.data.anonymous,
      authorId: actor.id,
      x: Math.round(Math.random() * 240),
      y: Math.round(Math.random() * 120),
    },
  });
  await logAudit({ actorId: actor.id, action: "NOTE_CREATED" });
  revalidatePath("/notes");
  return { success: true, message: "Note added." };
}

// Drag persistence: called directly from the client board with bound args.
export async function updateNotePositionAction(id: string, x: number, y: number): Promise<void> {
  await requireRole(...NOTE_ROLES);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  await prisma.note.update({ where: { id }, data: { x, y } });
  // No revalidate: position is already reflected optimistically on the client.
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...NOTE_ROLES);
  const id = String(formData.get("noteId") ?? "");
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return;
  // Author or admin may remove a note.
  if (note.authorId !== actor.id && actor.role !== Role.ADMIN) return;
  await prisma.note.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "NOTE_DELETED" });
  revalidatePath("/notes");
}

// Upvote toggles: one vote per user per note (NoteVote PK is [noteId,userId]).
export async function toggleVoteAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...NOTE_ROLES);
  const noteId = String(formData.get("noteId") ?? "");
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return;

  const existing = await prisma.noteVote.findUnique({
    where: { noteId_userId: { noteId, userId: actor.id } },
  });
  if (existing) {
    await prisma.noteVote.delete({ where: { noteId_userId: { noteId, userId: actor.id } } });
  } else {
    await prisma.noteVote.create({ data: { noteId, userId: actor.id } });
    if (note.authorId !== actor.id) {
      await createNotification(note.authorId, "NOTE_VOTE", { voter: actor.name });
    }
  }
  revalidatePath("/notes");
}

export async function addCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...NOTE_ROLES);
  const parsed = parseForm(noteCommentSchema, formData);
  if (!parsed.ok) return parsed.state;

  const note = await prisma.note.findUnique({ where: { id: parsed.data.noteId } });
  if (!note) return { error: "Note not found." };

  await prisma.noteComment.create({
    data: { noteId: parsed.data.noteId, authorId: actor.id, text: parsed.data.text },
  });
  if (note.authorId !== actor.id) {
    await createNotification(note.authorId, "NOTE_COMMENT", { commenter: actor.name });
  }
  revalidatePath("/notes");
  return { success: true, message: "Comment added." };
}
