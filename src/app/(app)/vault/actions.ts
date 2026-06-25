"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseForm, type ActionState } from "@/lib/form";
import { vaultDocumentSchema } from "@/lib/validation";
import { ensureVaultFolder, uploadFile } from "@/lib/drive";
import { Role } from "@/generated/prisma/client";

const VAULT_ROLES = [Role.ADMIN, Role.DRUM_MAJOR] as const;

export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(...VAULT_ROLES);
  const parsed = parseForm(vaultDocumentSchema, formData);
  if (!parsed.ok) return parsed.state;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  try {
    const folderId = await ensureVaultFolder();
    const uploaded = await uploadFile({
      folderId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    await prisma.vaultDocument.create({
      data: {
        title: parsed.data.title,
        category: parsed.data.category || null,
        driveFileId: uploaded.id,
        filename: file.name,
        uploadedById: actor.id,
      },
    });
  } catch (err) {
    return { error: `Couldn't save to Google Drive: ${(err as Error).message}` };
  }

  await logAudit({ actorId: actor.id, action: "VAULT_UPLOADED", target: parsed.data.title });
  revalidatePath("/vault");
  return { success: true, message: "Document uploaded." };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const { user: actor } = await requireRole(...VAULT_ROLES);
  const id = String(formData.get("documentId") ?? "");
  const doc = await prisma.vaultDocument.findUnique({ where: { id } });
  if (!doc) return;
  // Remove the DB record; the Drive file is left in place (recoverable).
  await prisma.vaultDocument.delete({ where: { id } });
  await logAudit({ actorId: actor.id, action: "VAULT_DELETED", target: doc.title });
  revalidatePath("/vault");
}
