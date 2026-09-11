import Link from "next/link";
import { Search, Music } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPieces } from "@/lib/music-catalog";
import { CATEGORY_LABELS, MUSIC_CATEGORIES, type MusicCategory } from "@/lib/music-naming";
import { cn } from "@/lib/utils";
import { CatalogResults } from "./catalog-results";

// Search + category filter over the MusicPiece catalog. Pure GET form so the
// URL is shareable and the back button works; results are paged.
export async function MusicCatalog({ q, category }: { q: string; category: MusicCategory | null }) {
  const { rows, total } = await searchPieces({ q, category });
  const filtering = !!q || !!category;

  const chip = (label: string, value: MusicCategory | null) => {
    const on = category === value;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value) params.set("category", value);
    const href = params.size ? `/library?${params}` : "/library";
    return (
      <Link
        key={label}
        href={href}
        className={cn(
          "rounded-full border px-3 py-1 text-xs transition-colors",
          on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Search the catalog by title or composer / arranger, or filter by ensemble.
        </p>
        <Link href="/library/new" className={buttonVariants()}>
          <Music data-icon="inline-start" />
          Add music
        </Link>
      </div>

      <form method="get" action="/library" className="flex gap-2">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search title or composer / arranger…" className="pl-8" />
        </div>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {chip("All", null)}
        {MUSIC_CATEGORIES.map((c) => chip(CATEGORY_LABELS[c], c))}
      </div>

      <CatalogResults
        initial={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))}
        total={total}
        q={q}
        category={category}
        filtering={filtering}
      />
    </section>
  );
}
