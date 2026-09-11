import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getItem } from "@/lib/library";
import { Role } from "@/generated/prisma/client";
import type { CreditType, MusicCategory } from "@/lib/music-naming";
import { LibraryBrowser } from "../library-browser";
import { PieceView } from "../piece-view";

export const metadata = { title: "Library — Drum Major Portal" };

export default async function LibraryFolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  // Files have no folder view — bounce to their Drive link.
  if (item.type === "FILE") redirect(`/library/${id}/open`);
  if (item.piece) {
    return (
      <PieceView
        folder={{ id: item.id, name: item.name, syncState: item.syncState, syncError: item.syncError, webViewLink: item.webViewLink }}
        piece={{
          id: item.piece.id,
          title: item.piece.title,
          credit: item.piece.credit,
          creditType: (item.piece.creditType as CreditType | null) ?? null,
          category: item.piece.category as MusicCategory,
          updatedAt: item.piece.updatedAt,
        }}
      />
    );
  }
  return <LibraryBrowser folderId={id} />;
}
