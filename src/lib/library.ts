import { prisma } from "@/lib/prisma";

// Query helpers for the Library tree. The DB is the source of truth for
// browsing; files live in Google Drive and are opened via webViewLink.

export type Crumb = { id: string | null; name: string };

// Immediate children of a folder (null = root), folders first then files,
// each group sorted by name (case-insensitive).
export async function listChildren(parentId: string | null) {
  const items = await prisma.libraryItem.findMany({
    where: { parentId },
    include: { uploadedBy: { select: { name: true } } },
  });
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "FOLDER" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function getItem(id: string) {
  return prisma.libraryItem.findUnique({
    where: { id },
    include: { uploadedBy: { select: { name: true } } },
  });
}

// Ancestor chain from root down to (and excluding) the given folder, plus a
// leading "Library" root crumb. Used for the breadcrumb header.
export async function getBreadcrumbs(folderId: string | null): Promise<Crumb[]> {
  const trail: Crumb[] = [];
  let currentId = folderId;
  while (currentId) {
    const node = await prisma.libraryItem.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!node) break;
    trail.unshift({ id: node.id, name: node.name });
    currentId = node.parentId;
  }
  trail.unshift({ id: null, name: "Library" });
  return trail;
}

// Returns true if maybeAncestorId is the item itself or an ancestor of it.
// Guards against moving a folder into its own subtree.
export async function isSelfOrAncestor(
  maybeAncestorId: string,
  itemId: string,
): Promise<boolean> {
  let currentId: string | null = itemId;
  while (currentId) {
    if (currentId === maybeAncestorId) return true;
    const node: { parentId: string | null } | null =
      await prisma.libraryItem.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    currentId = node?.parentId ?? null;
  }
  return false;
}
