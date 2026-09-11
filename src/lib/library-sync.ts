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
  isDriveConfigured,
  getRootFolderId,
  type DriveChild,
} from "@/lib/drive";
import { INDEX_FILE_NAME, rebuildIndexCsv } from "@/lib/music-index";
import { categoryFromFolderName, parsePieceFolderName, type MusicCategory } from "@/lib/music-naming";

// Write-back cache for the Library. Uploads are staged on disk and recorded in
// the DB immediately (PENDING) so they show up at once; a background worker then
// pushes them to Google Drive and marks them SYNCED. State lives in Postgres, so
// a restart mid-push simply resumes on the next tick. syncDriveTree() is the
// pull direction: it mirrors the whole Drive folder into the DB (adds, renames,
// deletions) and refreshes the MusicPiece catalog from folder names.

const STAGING_DIR = join(process.cwd(), ".staging");
const MAX_SYNC_ATTEMPTS = 5;
const MAX_DEPTH = 6;

// Stage uploaded bytes to disk; returns the path stored on the LibraryItem row.
export async function stageUpload(buffer: Buffer): Promise<string> {
  await mkdir(STAGING_DIR, { recursive: true });
  const path = join(STAGING_DIR, randomUUID());
  await writeFile(path, buffer);
  return path;
}

// Resolve the Drive folder id a child should be created in. Root items go to the
// configured root. Returns null if the parent isn't pushed yet.
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
        data: { driveId, webViewLink, syncState: "SYNCED", syncError: null, syncAttempts: 0 },
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
          syncAttempts: 0,
          stagedPath: null,
        },
      });
      await unlink(item.stagedPath).catch(() => {});
    }
  } catch (err) {
    await prisma.libraryItem.update({
      where: { id: item.id },
      data: {
        syncState: "ERROR",
        syncError: String(err instanceof Error ? err.message : err),
        syncAttempts: { increment: 1 },
      },
    });
  }
}

// Push every PENDING item to Drive, parents before children. Loops until no
// further progress so a freshly-created folder + its files settle in one run.
// Errored items are retried until MAX_SYNC_ATTEMPTS; after that they wait for a
// manual retry (retryItem) so a broken upload can't hammer Drive forever.
export async function processPendingItems(): Promise<void> {
  if (!(await isDriveConfigured())) return;
  await prisma.libraryItem.updateMany({
    where: { syncState: "ERROR", syncAttempts: { lt: MAX_SYNC_ATTEMPTS } },
    data: { syncState: "PENDING" },
  });

  let pushedTotal = 0;
  for (let pass = 0; pass < 20; pass++) {
    const pending = await prisma.libraryItem.findMany({
      where: { syncState: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (pending.length === 0) break;

    let pushed = 0;
    for (const { id } of pending) {
      await pushItem(id);
      const after = await prisma.libraryItem.findUnique({ where: { id }, select: { syncState: true } });
      if (after?.syncState === "SYNCED") pushed++;
    }
    pushedTotal += pushed;
    if (pushed === 0) break; // no progress; remaining items are blocked/errored
  }
  if (pushedTotal > 0) void rebuildIndexCsv();
}

export async function retryItem(itemId: string): Promise<void> {
  await prisma.libraryItem.update({
    where: { id: itemId },
    data: { syncState: "PENDING", syncError: null, syncAttempts: 0 },
  });
  kickSync();
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

export type SyncReport = { added: number; updated: number; removed: number; pieces: number };

type QueueEntry = { driveId: string; parentItemId: string | null; depth: number; category: MusicCategory | null };

// Mirror the Drive root into the DB: walk every folder, upsert items by Drive
// id (adopting app-created rows that haven't been pushed yet by name), refresh
// MusicPiece rows for folders directly under a category folder, and delete DB
// rows whose Drive file is gone. Then regenerate index.csv.
export async function syncDriveTree(): Promise<SyncReport> {
  if (!(await isDriveConfigured())) throw new Error("Google Drive isn't configured.");
  const rootDriveId = await getRootFolderId();
  if (!rootDriveId) throw new Error("Set the Drive root folder in Settings first.");
  const settings = await prisma.appSettings.findFirst({ select: { id: true, driveIndexFileId: true } });

  const report: SyncReport = { added: 0, updated: 0, removed: 0, pieces: 0 };
  const seen = new Set<string>();
  const queue: QueueEntry[] = [{ driveId: rootDriveId, parentItemId: null, depth: 0, category: null }];

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const children = await listFolderChildren(entry.driveId);
    for (const child of children) {
      if (entry.depth === 0 && !child.isFolder && child.name.toLowerCase() === INDEX_FILE_NAME) {
        if (settings && settings.driveIndexFileId !== child.driveId) {
          await prisma.appSettings.update({ where: { id: settings.id }, data: { driveIndexFileId: child.driveId } });
        }
        continue; // the index is generated, not browsed
      }
      seen.add(child.driveId);
      const item = await upsertFromDrive(child, entry.parentItemId, report);

      if (child.isFolder) {
        let category: MusicCategory | null = null;
        if (entry.depth === 0) category = categoryFromFolderName(child.name);
        if (entry.depth === 1 && entry.category) {
          await upsertPiece(item.id, child.name, entry.category);
          report.pieces++;
        }
        if (entry.depth < MAX_DEPTH) {
          queue.push({ driveId: child.driveId, parentItemId: item.id, depth: entry.depth + 1, category });
        }
      }
    }
  }

  // Anything we previously mirrored that Drive no longer lists is gone.
  const stale = await prisma.libraryItem.findMany({
    where: { syncState: "SYNCED", driveId: { not: null } },
    select: { id: true, driveId: true },
  });
  const staleIds = stale.filter((s) => s.driveId && !seen.has(s.driveId)).map((s) => s.id);
  if (staleIds.length > 0) {
    const { count } = await prisma.libraryItem.deleteMany({ where: { id: { in: staleIds } } });
    report.removed = count;
  }

  await rebuildIndexCsv();
  return report;
}

async function upsertFromDrive(child: DriveChild, parentItemId: string | null, report: SyncReport) {
  const data = {
    name: child.name,
    type: child.isFolder ? ("FOLDER" as const) : ("FILE" as const),
    parentId: parentItemId,
    driveId: child.driveId,
    webViewLink: child.webViewLink,
    mimeType: child.isFolder ? null : child.mimeType,
    sizeBytes: child.sizeBytes != null ? BigInt(child.sizeBytes) : null,
    syncState: "SYNCED" as const,
    syncError: null,
    syncAttempts: 0,
    stagedPath: null,
  };

  const byDrive = await prisma.libraryItem.findFirst({ where: { driveId: child.driveId } });
  if (byDrive) {
    const changed =
      byDrive.name !== data.name ||
      byDrive.parentId !== data.parentId ||
      byDrive.webViewLink !== data.webViewLink ||
      byDrive.syncState !== "SYNCED";
    if (changed) {
      report.updated++;
      return prisma.libraryItem.update({ where: { id: byDrive.id }, data });
    }
    return byDrive;
  }

  // Adopt a row the app created (folder or staged file) that matches by name
  // under the same parent, so a push and a sync never produce duplicates.
  const byName = await prisma.libraryItem.findFirst({
    where: { parentId: parentItemId, name: child.name, type: data.type, driveId: null },
  });
  if (byName) {
    report.updated++;
    if (byName.stagedPath) await unlink(byName.stagedPath).catch(() => {});
    return prisma.libraryItem.update({ where: { id: byName.id }, data });
  }

  report.added++;
  return prisma.libraryItem.create({ data });
}

async function upsertPiece(folderId: string, folderName: string, category: MusicCategory): Promise<void> {
  const parsed = parsePieceFolderName(folderName);
  await prisma.musicPiece.upsert({
    where: { folderId },
    update: { title: parsed.title, credit: parsed.credit, creditType: parsed.creditType, category },
    create: { folderId, title: parsed.title, credit: parsed.credit, creditType: parsed.creditType, category },
  });
}
