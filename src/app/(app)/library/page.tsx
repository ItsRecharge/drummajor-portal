import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { MUSIC_CATEGORIES, type MusicCategory } from "@/lib/music-naming";
import { MusicCatalog } from "./catalog";
import { LibraryTabs } from "./library-tabs";

export const metadata = { title: "Music search — Drum Major Portal" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = (MUSIC_CATEGORIES as readonly string[]).includes(sp.category ?? "")
    ? (sp.category as MusicCategory)
    : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Library</h1>
        <p className="text-sm text-muted-foreground">Sheet music in the shared Drive folder.</p>
      </div>
      <LibraryTabs active="search" />
      <MusicCatalog q={q} category={category} />
    </div>
  );
}
