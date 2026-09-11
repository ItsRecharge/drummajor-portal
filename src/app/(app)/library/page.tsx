import { MUSIC_CATEGORIES, type MusicCategory } from "@/lib/music-naming";
import { MusicCatalog } from "./catalog";
import { LibraryBrowser } from "./library-browser";

export const metadata = { title: "Library — Drum Major Portal" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = (MUSIC_CATEGORIES as readonly string[]).includes(sp.category ?? "")
    ? (sp.category as MusicCategory)
    : null;

  return (
    <div className="grid gap-10">
      <MusicCatalog q={q} category={category} />
      <LibraryBrowser folderId={null} embedded />
    </div>
  );
}
