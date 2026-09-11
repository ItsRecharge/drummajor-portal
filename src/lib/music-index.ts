import { prisma } from "@/lib/prisma";
import { findChildByName, getFileText, getRootFolderId, isDriveConfigured, updateFileContent, uploadFile } from "@/lib/drive";
import { categoryFromFolderName, parsePartFileName } from "@/lib/music-naming";
import { isSyncing } from "@/lib/library-sync";

// index.csv at the root of the Drive folder: one row per part file, in the
// schema the band already curated by hand. We merge the DB mirror into it
// (never discarding curated cells) whenever the catalog changes, and only
// upload when the result differs.

export { INDEX_FILE_NAME } from "@/lib/music-index-csv";
import { INDEX_FILE_NAME, mergeIndex, parseIndexCsv, toCsv, type DbFileRow } from "@/lib/music-index-csv";

// One entry per file under a category folder, straight from the DB mirror of
// the Drive tree: piece parts (with the piece's title/credit), loose files
// directly under a category (folder = ""), and files in non-piece subfolders.
export async function buildDbFileRows(): Promise<DbFileRow[]> {
  const [items, pieces] = await Promise.all([
    prisma.libraryItem.findMany({ select: { id: true, name: true, type: true, parentId: true } }),
    prisma.musicPiece.findMany({ select: { folderId: true, title: true, credit: true, creditType: true } }),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const pieceByFolder = new Map(pieces.map((p) => [p.folderId, p]));
  const categoryRoots = new Map(
    items
      .filter((i) => i.parentId === null && i.type === "FOLDER" && categoryFromFolderName(i.name))
      .map((i) => [i.id, i.name]),
  );

  const rows: DbFileRow[] = [];
  for (const f of items) {
    if (f.type !== "FILE" || !f.parentId) continue;
    // Walk up to the category root (at most a few levels).
    let categoryName: string | null = null;
    let cur = byId.get(f.parentId);
    for (let depth = 0; cur && depth < 8; depth++) {
      const cat = categoryRoots.get(cur.id);
      if (cat) {
        categoryName = cat;
        break;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (!categoryName) continue;

    const parent = byId.get(f.parentId)!;
    const piece = pieceByFolder.get(parent.id);
    const parsed = piece ? parsePartFileName(f.name) : null;
    rows.push({
      category: categoryName,
      folder: categoryRoots.has(parent.id) ? "" : parent.name,
      file: f.name,
      partGuess: parsed ? (parsed.to ? `${parsed.from} to ${parsed.to}` : parsed.from) : "",
      song: piece?.title ?? "",
      composer: piece?.creditType === "COMPOSER" ? (piece.credit ?? "") : "",
      arranger: piece?.creditType === "ARRANGER" ? (piece.credit ?? "") : "",
    });
  }
  return rows;
}

// Coalesce bursts: one rebuild runs at a time; a request during a run queues
// exactly one more. Never throws — the catalog must not depend on Drive being up.
let inFlight: Promise<void> | null = null;
let dirty = false;

export function rebuildIndexCsv(opts: { fromSync?: boolean } = {}): Promise<void> {
  // A tree sync is mid-flight: the mirror is incomplete, so a rebuild now would
  // drop rows. The sync itself rebuilds when it finishes.
  if (!opts.fromSync && isSyncing()) return Promise.resolve();
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

  let fileId = settings.driveIndexFileId;
  if (!fileId) {
    const existing = await findChildByName(rootId, INDEX_FILE_NAME);
    fileId = existing?.driveId ?? null;
  }
  let existingCsv = "";
  if (fileId) {
    try {
      existingCsv = await getFileText(fileId);
    } catch (err) {
      // Can't read the current index: don't overwrite what we can't see.
      console.error("[music-index] could not read index.csv, skipping rebuild:", err);
      return;
    }
  }
  const rows = mergeIndex(existingCsv, await buildDbFileRows());
  const existingRows = parseIndexCsv(existingCsv).length;
  // Guard against wiping a curated index from a partial mirror: a rebuild that
  // would shed more than a third of the rows is almost certainly wrong.
  if (existingRows >= 20 && rows.length < existingRows * (2 / 3)) {
    console.error(`[music-index] refusing to shrink index.csv from ${existingRows} to ${rows.length} rows`);
    return;
  }
  const csv = toCsv(rows);

  if (fileId) {
    // Skip the upload when nothing changed, so the file's Drive history stays quiet.
    if (existingCsv.replace(/\r\n/g, "\n").trim() !== csv.replace(/\r\n/g, "\n").trim()) {
      await updateFileContent(fileId, "text/csv", Buffer.from(csv, "utf8"));
    }
  } else {
    const created = await uploadFile({ folderId: rootId, filename: INDEX_FILE_NAME, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    fileId = created.id;
  }
  if (fileId !== settings.driveIndexFileId) {
    await prisma.appSettings.update({ where: { id: settings.id }, data: { driveIndexFileId: fileId } });
  }
}
