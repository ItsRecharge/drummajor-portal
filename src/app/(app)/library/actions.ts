"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyAll } from "@/lib/notify";
import { parseForm, type ActionState } from "@/lib/form";
import { musicPieceSchema } from "@/lib/validation";
import { renameDriveItem } from "@/lib/drive";
import { stageUpload, kickSync, deleteFromDrive, syncDriveTree, retryItem } from "@/lib/library-sync";
import { addParts, createPiece, renamePart, updatePiece, type PartUpload } from "@/lib/music-catalog";
import { rebuildIndexCsv } from "@/lib/music-index";
import { partIndex, type MusicCategory } from "@/lib/music-naming";
import { Role } from "@/generated/prisma/client";

const LIBRARY_ROLES = [Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN] as const;

function revalidate(parentId: string | null) {
  revalidatePath("/library");
  if (parentId) revalidatePath(`/library/${parentId}`);
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// --- Generic folder browser -------------------------------------------------

export async function createFolderAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const name = String(formData.get("name") ?? "").trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!name) return;

  await prisma.libraryItem.create({
    data: { name, type: "FOLDER", parentId, uploadedById: user.id, syncState: "PENDING" },
  });
  await logAudit({ actorId: user.id, action: "LIBRARY_FOLDER_CREATED", target: name });
  after(() => kickSync());
  revalidate(parentId);
}

export async function uploadFilesAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const parentId = (formData.get("parentId") as string) || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return;

  for (const file of files) {
    const stagedPath = await stageUpload(Buffer.from(await file.arrayBuffer()));
    await prisma.libraryItem.create({
      data: {
        name: file.name,
        type: "FILE",
        parentId,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: BigInt(file.size),
        stagedPath,
        uploadedById: user.id,
        syncState: "PENDING",
      },
    });
  }
  await logAudit({ actorId: user.id, action: "LIBRARY_FILES_UPLOADED", target: `${files.length} file(s)` });
  after(() => kickSync());
  revalidate(parentId);
}

// Renames in Drive first (when the item is there) so the DB never claims a
// name Drive doesn't have.
export async function renameItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { fieldErrors: { name: "Required" } };

  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) return { error: "Item not found." };
  if (item.name === name) return { success: true, message: "No change." };
  try {
    if (item.driveId && item.syncState === "SYNCED") await renameDriveItem(item.driveId, name);
  } catch (err) {
    return { error: `Google Drive refused the rename: ${message(err, "unknown error")}` };
  }
  await prisma.libraryItem.update({ where: { id }, data: { name } });
  await logAudit({ actorId: user.id, action: "LIBRARY_ITEM_RENAMED", target: name });
  after(() => rebuildIndexCsv());
  revalidate(item.parentId);
  return { success: true, message: "Renamed." };
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item) return;
  // Remove the DB subtree (FK cascade), then delete from Drive (folder delete
  // removes its contents too).
  await prisma.libraryItem.delete({ where: { id } });
  await deleteFromDrive(item.driveId);
  await logAudit({ actorId: user.id, action: "LIBRARY_ITEM_DELETED", target: item.name });
  after(() => rebuildIndexCsv());
  revalidate(item.parentId);
}

export async function retryItemAction(formData: FormData): Promise<void> {
  await requireRole(...LIBRARY_ROLES);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await prisma.libraryItem.findUnique({ where: { id }, select: { parentId: true } });
  if (!item) return;
  await retryItem(id);
  revalidate(item.parentId);
}

export async function syncDriveAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  try {
    const r = await syncDriveTree();
    await logAudit({ actorId: user.id, action: "LIBRARY_SYNCED", metadata: r });
    revalidatePath("/library", "layout");
    return {
      success: true,
      message: `Synced with Drive: ${r.added} added, ${r.updated} updated, ${r.removed} removed, ${r.pieces} pieces catalogued.`,
    };
  } catch (err) {
    return { error: message(err, "Sync failed.") };
  }
}

// --- Music catalog ----------------------------------------------------------

// Read "files" + "parts-<i>" pairs from the Add-music / Add-parts forms.
async function readPartUploads(formData: FormData, category: MusicCategory): Promise<{ ok: true; files: PartUpload[] } | { ok: false; error: string }> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Add at least one PDF." };
  const out: PartUpload[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!isPdf) return { ok: false, error: `“${f.name}” isn't a PDF.` };
    const parts = formData.getAll(`parts-${i}`).map(String).filter((p) => partIndex(p, category) >= 0);
    if (parts.length === 0) return { ok: false, error: `Pick the parts in “${f.name}”.` };
    out.push({ originalName: f.name, parts, mimeType: "application/pdf", buffer: Buffer.from(await f.arrayBuffer()) });
  }
  return { ok: true, files: out };
}

function pieceInput(data: { title: string; credit?: string; creditType?: "ARRANGER" | "COMPOSER"; category: MusicCategory }) {
  const credit = data.credit?.trim() || null;
  return {
    title: data.title.trim(),
    credit,
    creditType: credit ? (data.creditType ?? "ARRANGER") : null,
    category: data.category,
  };
}

export async function createPieceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const parsed = parseForm(musicPieceSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = pieceInput(parsed.data);
  const uploads = await readPartUploads(formData, input.category);
  if (!uploads.ok) return { error: uploads.error };

  let folderId: string;
  try {
    ({ folderId } = await createPiece(input, uploads.files, user.id));
  } catch (err) {
    return { error: message(err, "Could not add the piece.") };
  }
  await logAudit({ actorId: user.id, action: "MUSIC_PIECE_CREATED", target: input.title, metadata: { category: input.category, files: uploads.files.length } });
  await notifyAll("MUSIC_ADDED", { title: input.title }, user.id);
  after(() => kickSync());
  revalidatePath("/library", "layout");
  redirect(`/library/${folderId}`);
}

export async function updatePieceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const pieceId = String(formData.get("pieceId") ?? "");
  const parsed = parseForm(musicPieceSchema, formData);
  if (!parsed.ok) return parsed.state;
  const input = pieceInput(parsed.data);
  try {
    await updatePiece(pieceId, input);
  } catch (err) {
    return { error: message(err, "Could not update the piece.") };
  }
  await logAudit({ actorId: user.id, action: "MUSIC_PIECE_UPDATED", target: input.title });
  after(() => rebuildIndexCsv());
  revalidatePath("/library", "layout");
  return { success: true, message: "Details saved." };
}

export async function addPartsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const folderId = String(formData.get("folderId") ?? "");
  const piece = await prisma.musicPiece.findUnique({ where: { folderId } });
  if (!piece) return { error: "Piece not found." };
  const category = piece.category as MusicCategory;
  const uploads = await readPartUploads(formData, category);
  if (!uploads.ok) return { error: uploads.error };
  await addParts(folderId, piece.title, category, uploads.files, user.id);
  after(() => kickSync());
  await logAudit({ actorId: user.id, action: "MUSIC_PARTS_ADDED", target: piece.title, metadata: { files: uploads.files.length } });
  revalidate(folderId);
  return { success: true, message: `Added ${uploads.files.length} file${uploads.files.length === 1 ? "" : "s"}.` };
}

export async function renamePartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const fileId = String(formData.get("fileId") ?? "");
  const parts = formData.getAll("parts").map(String).filter(Boolean);
  if (parts.length === 0) return { error: "Pick at least one part." };
  const file = await prisma.libraryItem.findUnique({ where: { id: fileId }, select: { parentId: true, name: true } });
  if (!file) return { error: "File not found." };
  try {
    await renamePart(fileId, parts);
  } catch (err) {
    return { error: message(err, "Could not rename the file.") };
  }
  await logAudit({ actorId: user.id, action: "LIBRARY_ITEM_RENAMED", target: file.name });
  after(() => rebuildIndexCsv());
  revalidate(file.parentId);
  return { success: true, message: "Parts updated." };
}

export async function deletePieceAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const folderId = String(formData.get("folderId") ?? "");
  const folder = await prisma.libraryItem.findUnique({ where: { id: folderId }, include: { piece: true } });
  if (!folder) return;
  await prisma.libraryItem.delete({ where: { id: folderId } });
  await deleteFromDrive(folder.driveId);
  await logAudit({ actorId: user.id, action: "MUSIC_PIECE_DELETED", target: folder.piece?.title ?? folder.name });
  after(() => rebuildIndexCsv());
  revalidatePath("/library", "layout");
  redirect("/library");
}
