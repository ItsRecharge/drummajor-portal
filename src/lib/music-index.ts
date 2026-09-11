import { prisma } from "@/lib/prisma";
import { findChildByName, getRootFolderId, isDriveConfigured, updateFileContent, uploadFile } from "@/lib/drive";
import { CATEGORY_LABELS, parsePartFileName, sortPartFiles, type MusicCategory } from "@/lib/music-naming";

// index.csv at the root of the Drive folder: one row per piece, regenerated
// whenever the catalog changes. Students browse Drive directly, so the index is
// the human-readable table of contents next to the category folders.

export { INDEX_FILE_NAME, toCsv, type IndexRow } from "@/lib/music-index-csv";
import { INDEX_FILE_NAME, toCsv as csv, type IndexRow as Row } from "@/lib/music-index-csv";

export async function buildIndexRows(): Promise<Row[]> {
  const pieces = await prisma.musicPiece.findMany({
    include: {
      folder: {
        select: {
          webViewLink: true,
          updatedAt: true,
          children: { where: { type: "FILE" }, select: { name: true } },
        },
      },
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  return pieces.map((p) => {
    const category = p.category as MusicCategory;
    const files = sortPartFiles(p.folder.children, category);
    const parts = files
      .map((f) => parsePartFileName(f.name))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => (r.to ? `${r.from} to ${r.to}` : r.from))
      .join("; ");
    return {
      category: CATEGORY_LABELS[category] ?? p.category,
      title: p.title,
      creditType: p.creditType === "ARRANGER" ? "Arranger" : p.creditType === "COMPOSER" ? "Composer" : "",
      credit: p.credit ?? "",
      parts,
      files: files.length,
      link: p.folder.webViewLink ?? "",
      updated: p.updatedAt.toISOString().slice(0, 10),
    };
  });
}

// Coalesce bursts: one rebuild runs at a time; a request during a run queues
// exactly one more. Never throws — the catalog must not depend on Drive being up.
let inFlight: Promise<void> | null = null;
let dirty = false;

export function rebuildIndexCsv(): Promise<void> {
  if (inFlight) {
    dirty = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        dirty = false;
        await writeIndexOnce();
      } while (dirty);
    } catch (err) {
      console.error("[music-index] rebuild failed:", err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function writeIndexOnce(): Promise<void> {
  if (!(await isDriveConfigured())) return;
  const rootId = await getRootFolderId();
  if (!rootId) return;
  const settings = await prisma.appSettings.findFirst({ select: { id: true, driveIndexFileId: true } });
  if (!settings) return;

  const csvBytes = Buffer.from(csv(await buildIndexRows()), "utf8");
  let fileId = settings.driveIndexFileId;
  if (!fileId) {
    const existing = await findChildByName(rootId, INDEX_FILE_NAME);
    fileId = existing?.driveId ?? null;
  }
  if (fileId) {
    await updateFileContent(fileId, "text/csv", csvBytes);
  } else {
    const created = await uploadFile({ folderId: rootId, filename: INDEX_FILE_NAME, mimeType: "text/csv", buffer: csvBytes });
    fileId = created.id;
  }
  if (fileId !== settings.driveIndexFileId) {
    await prisma.appSettings.update({ where: { id: settings.id }, data: { driveIndexFileId: fileId } });
  }
}
