import { prisma } from "@/lib/prisma";
import { renameDriveItem, moveDriveItem } from "@/lib/drive";
import { stageUpload } from "@/lib/library-sync";
import {
  CATEGORY_FOLDERS,
  categoryFromFolderName,
  parsePartFileName,
  partFileName,
  pieceFolderName,
  sortPartFiles,
  type CreditType,
  type MusicCategory,
} from "@/lib/music-naming";

// The music catalog: pieces are folders directly under a category folder, parts
// are the PDFs inside. The DB rows (MusicPiece) mirror what the folder/file
// names say, so every edit here renames in Drive too and never lets the two
// drift. Drive calls are skipped for rows that haven't been pushed yet — the
// worker will create them with the new names. Callers schedule the push
// (kickSync) and the index rebuild after their response with next's after().

export type PieceInput = {
  title: string;
  credit: string | null;
  creditType: CreditType | null;
  category: MusicCategory;
};

export type PartUpload = { originalName: string; parts: string[]; mimeType: string; buffer: Buffer };

// Find (or create as PENDING) the top-level folder for a category.
export async function ensureCategoryFolder(category: MusicCategory, actorId: string) {
  const roots = await prisma.libraryItem.findMany({ where: { parentId: null, type: "FOLDER" } });
  const found = roots.find((r) => categoryFromFolderName(r.name) === category);
  if (found) return found;
  return prisma.libraryItem.create({
    data: { name: CATEGORY_FOLDERS[category], type: "FOLDER", parentId: null, uploadedById: actorId, syncState: "PENDING" },
  });
}

function pieceTitle(p: PieceInput): string {
  return pieceFolderName({ title: p.title, credit: p.credit, creditType: p.creditType });
}

export async function createPiece(input: PieceInput, files: PartUpload[], actorId: string): Promise<{ folderId: string }> {
  const categoryFolder = await ensureCategoryFolder(input.category, actorId);
  const folderName = pieceTitle(input);

  const clash = await prisma.libraryItem.findFirst({
    where: { parentId: categoryFolder.id, type: "FOLDER", name: folderName },
    select: { id: true },
  });
  if (clash) throw new Error(`“${folderName}” already exists in ${CATEGORY_FOLDERS[input.category]}.`);

  const folder = await prisma.libraryItem.create({
    data: { name: folderName, type: "FOLDER", parentId: categoryFolder.id, uploadedById: actorId, syncState: "PENDING" },
  });
  await prisma.musicPiece.create({
    data: { folderId: folder.id, title: input.title, credit: input.credit, creditType: input.creditType, category: input.category },
  });
  await addParts(folder.id, input.title, input.category, files, actorId);
  return { folderId: folder.id };
}

// Stage part PDFs under a piece folder with generated names.
export async function addParts(
  folderId: string,
  title: string,
  category: MusicCategory,
  files: PartUpload[],
  actorId: string,
): Promise<void> {
  for (const f of files) {
    const name = partFileName(title, f.parts, category);
    const stagedPath = await stageUpload(f.buffer);
    await prisma.libraryItem.create({
      data: {
        name,
        type: "FILE",
        parentId: folderId,
        mimeType: f.mimeType || "application/pdf",
        sizeBytes: BigInt(f.buffer.length),
        stagedPath,
        uploadedById: actorId,
        syncState: "PENDING",
      },
    });
  }
}

async function renameItem(itemId: string, name: string): Promise<void> {
  const item = await prisma.libraryItem.findUnique({ where: { id: itemId }, select: { name: true, driveId: true, syncState: true } });
  if (!item || item.name === name) return;
  if (item.driveId && item.syncState === "SYNCED") await renameDriveItem(item.driveId, name);
  await prisma.libraryItem.update({ where: { id: itemId }, data: { name } });
}

// Edit a piece's metadata: renames the folder, moves it if the category
// changed, and renames every part file that carried the old title.
export async function updatePiece(pieceId: string, input: PieceInput): Promise<void> {
  const piece = await prisma.musicPiece.findUnique({ where: { id: pieceId }, include: { folder: true } });
  if (!piece) throw new Error("Piece not found.");
  const oldTitle = piece.title;
  const oldCategory = piece.category as MusicCategory;

  if (input.category !== oldCategory) {
    const target = await ensureCategoryFolder(input.category, piece.folder.uploadedById ?? "");
    const from = piece.folder.parentId
      ? await prisma.libraryItem.findUnique({ where: { id: piece.folder.parentId }, select: { driveId: true } })
      : null;
    if (piece.folder.driveId && from?.driveId && target.driveId) {
      await moveDriveItem(piece.folder.driveId, from.driveId, target.driveId);
    } else if (piece.folder.driveId) {
      throw new Error(`${CATEGORY_FOLDERS[input.category]} isn't on Drive yet — run a sync, then try again.`);
    }
    await prisma.libraryItem.update({ where: { id: piece.folderId }, data: { parentId: target.id } });
  }

  await renameItem(piece.folderId, pieceTitle(input));

  if (input.title !== oldTitle) {
    const parts = await prisma.libraryItem.findMany({ where: { parentId: piece.folderId, type: "FILE" } });
    for (const part of parts) {
      const parsed = parsePartFileName(part.name);
      if (!parsed || parsed.title !== oldTitle) continue;
      const range = parsed.to ? [parsed.from, parsed.to] : [parsed.from];
      await renameItem(part.id, partFileName(input.title, range, input.category));
    }
  }

  await prisma.musicPiece.update({
    where: { id: pieceId },
    data: { title: input.title, credit: input.credit, creditType: input.creditType, category: input.category },
  });
}

// Re-label one part file (e.g. it actually covers Flute 1 to Oboe).
export async function renamePart(fileId: string, parts: string[]): Promise<void> {
  const file = await prisma.libraryItem.findUnique({
    where: { id: fileId },
    include: { parent: { include: { piece: true } } },
  });
  if (!file || !file.parent?.piece) throw new Error("Not a part of a catalogued piece.");
  const piece = file.parent.piece;
  await renameItem(fileId, partFileName(piece.title, parts, piece.category as MusicCategory));
}

export type PieceSummary = {
  id: string;
  folderId: string;
  title: string;
  credit: string | null;
  creditType: CreditType | null;
  category: MusicCategory;
  files: number;
  syncState: "PENDING" | "SYNCED" | "ERROR";
  updatedAt: Date;
};

export async function searchPieces(opts: { q?: string; category?: MusicCategory | null } = {}): Promise<PieceSummary[]> {
  const q = opts.q?.trim();
  const rows = await prisma.musicPiece.findMany({
    where: {
      ...(opts.category ? { category: opts.category } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { credit: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    include: { folder: { select: { syncState: true, _count: { select: { children: { where: { type: "FILE" } } } } } } },
    orderBy: [{ title: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    folderId: r.folderId,
    title: r.title,
    credit: r.credit,
    creditType: (r.creditType as CreditType | null) ?? null,
    category: r.category as MusicCategory,
    files: r.folder._count.children,
    syncState: r.folder.syncState,
    updatedAt: r.updatedAt,
  }));
}

export type PartRow = {
  id: string;
  name: string;
  from: string | null;
  to: string | null;
  sizeBytes: bigint | null;
  syncState: "PENDING" | "SYNCED" | "ERROR";
  syncError: string | null;
  syncAttempts: number;
};

export async function piecePartsSorted(folderId: string, category: MusicCategory): Promise<PartRow[]> {
  const files = await prisma.libraryItem.findMany({ where: { parentId: folderId, type: "FILE" } });
  return sortPartFiles(files, category).map((f) => {
    const parsed = parsePartFileName(f.name);
    return {
      id: f.id,
      name: f.name,
      from: parsed?.from ?? null,
      to: parsed?.to ?? null,
      sizeBytes: f.sizeBytes,
      syncState: f.syncState,
      syncError: f.syncError,
      syncAttempts: f.syncAttempts,
    };
  });
}
