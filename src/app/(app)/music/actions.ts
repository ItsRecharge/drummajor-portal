"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { musicPieceSchema } from "@/lib/validation";
import { ensureRootFolder, createFolder, uploadFile } from "@/lib/drive";
import { notifyAll } from "@/lib/notify";
import { Role } from "@/generated/prisma/client";

const MUSIC_ROLES = [Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN] as const;

function splitTags(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

async function readPdfFiles(formData: FormData): Promise<{ name: string; buffer: Buffer; mimeType: string }[]> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const out: { name: string; buffer: Buffer; mimeType: string }[] = [];
  for (const file of files) {
    out.push({
      name: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "application/pdf",
    });
  }
  return out;
}

export async function addPieceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...MUSIC_ROLES);
  const parsed = parseForm(musicPieceSchema, formData);
  if (!parsed.ok) return parsed.state;

  let pieceId: string;
  try {
    const root = await ensureRootFolder();
    const folderId = await createFolder(parsed.data.title, root);
    const piece = await prisma.musicPiece.create({
      data: {
        title: parsed.data.title,
        composer: parsed.data.composer || null,
        arranger: parsed.data.arranger || null,
        ensemble: parsed.data.ensemble || null,
        notes: parsed.data.notes || null,
        tags: splitTags(parsed.data.tags),
        driveFolderId: folderId,
      },
    });
    pieceId = piece.id;

    for (const file of await readPdfFiles(formData)) {
      const uploaded = await uploadFile({
        folderId,
        filename: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      await prisma.musicFile.create({
        data: {
          musicPieceId: piece.id,
          filename: file.name,
          driveFileId: uploaded.id,
          sizeBytes: BigInt(uploaded.sizeBytes),
        },
      });
    }
  } catch (err) {
    return { error: `Couldn't save to Google Drive: ${(err as Error).message}` };
  }

  await logAudit({ actorId: actor.id, action: "MUSIC_ADDED", target: parsed.data.title });
  await notifyAll("MUSIC_ADDED", { title: parsed.data.title }, actor.id);
  revalidatePath("/music");
  redirect(`/music/${pieceId}`);
}

export async function editPieceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...MUSIC_ROLES);
  const parsed = parseForm(musicPieceSchema, formData);
  if (!parsed.ok) return parsed.state;
  const id = String(formData.get("pieceId") ?? "");
  const piece = await prisma.musicPiece.findUnique({ where: { id } });
  if (!piece) return { error: "Piece not found." };

  await prisma.musicPiece.update({
    where: { id },
    data: {
      title: parsed.data.title,
      composer: parsed.data.composer || null,
      arranger: parsed.data.arranger || null,
      ensemble: parsed.data.ensemble || null,
      notes: parsed.data.notes || null,
      tags: splitTags(parsed.data.tags),
    },
  });
  await logAudit({ actorId: actor.id, action: "MUSIC_EDITED", target: parsed.data.title });
  revalidatePath(`/music/${id}`);
  revalidatePath("/music");
  return { success: true, message: "Piece updated." };
}

// Upload new file(s) into an existing piece. When `replaceFileId` is given, the new
// upload supersedes it (version = old + 1) and the old MusicFile row is removed.
export async function addFilesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...MUSIC_ROLES);
  const id = String(formData.get("pieceId") ?? "");
  const replaceFileId = String(formData.get("replaceFileId") ?? "");
  const piece = await prisma.musicPiece.findUnique({ where: { id } });
  if (!piece) return { error: "Piece not found." };

  const files = await readPdfFiles(formData);
  if (files.length === 0) return { error: "Choose at least one PDF to upload." };

  try {
    const replaced = replaceFileId
      ? await prisma.musicFile.findUnique({ where: { id: replaceFileId } })
      : null;
    for (const file of files) {
      const uploaded = await uploadFile({
        folderId: piece.driveFolderId,
        filename: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
      await prisma.musicFile.create({
        data: {
          musicPieceId: id,
          filename: file.name,
          driveFileId: uploaded.id,
          sizeBytes: BigInt(uploaded.sizeBytes),
          version: replaced ? replaced.version + 1 : 1,
        },
      });
    }
    if (replaced) await prisma.musicFile.delete({ where: { id: replaced.id } });
  } catch (err) {
    return { error: `Upload failed: ${(err as Error).message}` };
  }

  await logAudit({ actorId: actor.id, action: "MUSIC_FILE_ADDED", target: piece.title });
  revalidatePath(`/music/${id}`);
  return { success: true, message: "Uploaded." };
}

export async function deletePieceAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...MUSIC_ROLES);
  const id = String(formData.get("pieceId") ?? "");
  const piece = await prisma.musicPiece.findUnique({ where: { id } });
  if (!piece) return;
  // Remove DB records; the Drive folder/files are left in place (recoverable).
  await prisma.musicPiece.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "MUSIC_DELETED", target: piece.title });
  revalidatePath("/music");
  redirect("/music");
}
