import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import {
  createFolder,
  uploadFile,
  shareAnyoneWithLink,
  ensureRootFolder,
  deleteDriveItem,
  listFolderChildren,
} from "@/lib/drive";

// Write-back cache for the Library. Uploads are staged on disk and recorded in
// the DB immediately (PENDING) so they show up at once; a background worker then
// pushes them to Google Drive and marks them SYNCED. State lives in Postgres, so
// a restart mid-push simply resumes on the next tick.

const STAGING_DIR = join(process.cwd(), ".staging");

// Stage uploaded bytes to disk; returns the path stored on the LibraryItem row.
export async function stageUpload(buffer: Buffer): Promise<string> {
  await mkdir(STAGING_DIR, { recursive: true });
  const path = join(STAGING_DIR, randomUUID());
  await writeFile(path, buffer);
  return path;
}

// Resolve the Drive folder id a child should be created in. Root items go to the
// lazily-created "Band Library" root. Returns null if the parent isn't pushed yet.
async function parentDriveId(parentId: string | null): Promise<string | null> {
  if (!parentId) return ensureRootFolder();
  const parent = await prisma.libraryItem.findUnique({
    where: { id: parentId },
    select: { driveId: true, syncState: true },
  });
  if (!parent || parent.syncState !== "SYNCED" || !parent.driveId) return null;
  return parent.driveId;
}

async function pushItem(itemId: string): Promise<void> {
  const item = await prisma.libraryItem.findUnique({ where: { id: itemId } });
  if (!item || item.syncState === "SYNCED") return;

  const folderId = await parentDriveId(item.parentId);
  if (!folderId) return; // parent not ready; a later pass will pick this up

  try {
    if (item.type === "FOLDER") {
      const driveId = await createFolder(item.name, folderId);
      const webViewLink = await shareAnyoneWithLink(driveId);
      await prisma.libraryItem.update({
        where: { id: item.id },
        data: { driveId, webViewLink, syncState: "SYNCED", syncError: null },
      });
    } else {
      if (!item.stagedPath) throw new Error("Staged file missing for upload");
      const buffer = await readFile(item.stagedPath);
      const { id: driveId, sizeBytes } = await uploadFile({
        folderId,
        filename: item.name,
        mimeType: item.mimeType ?? "application/octet-stream",
        buffer,
      });
      const webViewLink = await shareAnyoneWithLink(driveId);
      await prisma.libraryItem.update({
        where: { id: item.id },
        data: {
          driveId,
          webViewLink,
          sizeBytes: BigInt(sizeBytes),
          syncState: "SYNCED",
          syncError: null,
          stagedPath: null,
        },
      });
      await unlink(item.stagedPath).catch(() => {});
    }
  } catch (err) {
    await prisma.libraryItem.update({
      where: { id: item.id },
      data: { syncState: "ERROR", syncError: String(err instanceof Error ? err.message : err) },
    });
  }
}

// Push every PENDING item to Drive, parents before children. Loops until no
// further progress so a freshly-created folder + its files settle in one run.
export async function processPendingItems(): Promise<void> {
  // Retry transient errors on each full pass.
  await prisma.libraryItem.updateMany({
    where: { syncState: "ERROR" },
    data: { syncState: "PENDING" },
  });

  for (let pass = 0; pass < 20; pass++) {
    const pending = await prisma.libraryItem.findMany({
      where: { syncState: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (pending.length === 0) return;

    let pushed = 0;
    for (const { id } of pending) {
      const before = await prisma.libraryItem.findUnique({
        where: { id },
        select: { syncState: true },
      });
      await pushItem(id);
      const after = await prisma.libraryItem.findUnique({
        where: { id },
        select: { syncState: true },
      });
      if (before?.syncState === "PENDING" && after?.syncState !== "PENDING") pushed++;
    }
    if (pushed === 0) return; // no progress; remaining items are blocked/errored
  }
}

// Fire-and-forget kick used right after an upload so items sync promptly without
// waiting for the next cron tick.
export function kickSync(): void {
  processPendingItems().catch((err) =>
    console.error("[library-sync] processPendingItems failed:", err),
  );
}

// Delete an item (and its subtree) from Drive. DB rows are removed by the caller
// via the cascading FK; this only handles the Drive side.
export async function deleteFromDrive(driveId: string | null): Promise<void> {
  if (!driveId) return;
  await deleteDriveItem(driveId).catch((err) =>
    console.error("[library-sync] deleteDriveItem failed:", err),
  );
}

// Reconcile one folder against Drive: add any Drive children missing from the DB.
// The DB is assumed correct otherwise, so this only adds (never deletes) and is
// safe to run on demand. Returns the count of newly-added items.
export async function refreshFolderFromDrive(folderId: string | null): Promise<number> {
  const driveId = folderId
    ? (await prisma.libraryItem.findUnique({
        where: { id: folderId },
        select: { driveId: true },
      }))?.driveId
    : await ensureRootFolder();
  if (!driveId) return 0;

  const [driveChildren, dbChildren] = await Promise.all([
    listFolderChildren(driveId),
    prisma.libraryItem.findMany({
      where: { parentId: folderId },
      select: { driveId: true },
    }),
  ]);
  const known = new Set(dbChildren.map((c) => c.driveId).filter(Boolean));

  let added = 0;
  for (const child of driveChildren) {
    if (known.has(child.driveId)) continue;
    await prisma.libraryItem.create({
      data: {
        name: child.name,
        type: child.isFolder ? "FOLDER" : "FILE",
        parentId: folderId,
        driveId: child.driveId,
        webViewLink: child.webViewLink,
        mimeType: child.isFolder ? null : child.mimeType,
        sizeBytes: child.sizeBytes != null ? BigInt(child.sizeBytes) : null,
        syncState: "SYNCED",
      },
    });
    added++;
  }
  return added;
}
