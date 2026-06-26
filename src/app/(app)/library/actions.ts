"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { stageUpload, kickSync, deleteFromDrive, refreshFolderFromDrive } from "@/lib/library-sync";
import { Role } from "@/generated/prisma/client";

const LIBRARY_ROLES = [Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN] as const;

function revalidate(parentId: string | null) {
  revalidatePath("/library");
  if (parentId) revalidatePath(`/library/${parentId}`);
}

export async function createFolderAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const name = String(formData.get("name") ?? "").trim();
  const parentId = (formData.get("parentId") as string) || null;
  if (!name) return;

  await prisma.libraryItem.create({
    data: { name, type: "FOLDER", parentId, uploadedById: user.id, syncState: "PENDING" },
  });
  await logAudit({ actorId: user.id, action: "LIBRARY_FOLDER_CREATED", target: name });
  kickSync();
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
  kickSync();
  revalidate(parentId);
}

export async function renameItemAction(formData: FormData): Promise<void> {
  const { user } = await requireRole(...LIBRARY_ROLES);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const item = await prisma.libraryItem.findUnique({ where: { id }, select: { parentId: true } });
  if (!item) return;
  await prisma.libraryItem.update({ where: { id }, data: { name } });
  await logAudit({ actorId: user.id, action: "LIBRARY_ITEM_RENAMED", target: name });
  revalidate(item.parentId);
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
  revalidate(item.parentId);
}

export async function refreshFromDriveAction(formData: FormData): Promise<void> {
  await requireRole(...LIBRARY_ROLES);
  const folderId = (formData.get("folderId") as string) || null;
  await refreshFolderFromDrive(folderId);
  revalidate(folderId);
}
