import Link from "next/link";
import { Search, Music, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPieces } from "@/lib/music-catalog";
import { CATEGORY_LABELS, MUSIC_CATEGORIES, type MusicCategory } from "@/lib/music-naming";
import { cn } from "@/lib/utils";

function creditLine(credit: string | null, creditType: "ARRANGER" | "COMPOSER" | null): string {
  if (!credit) return "";
  return creditType === "ARRANGER" ? `arr. ${credit}` : credit;
}

// Search + category filter over the MusicPiece catalog. Pure GET form so the
// URL is shareable and the back button works.
export async function MusicCatalog({ q, category }: { q: string; category: MusicCategory | null }) {
  const pieces = await searchPieces({ q, category });
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Library</h1>
          <p className="text-sm text-muted-foreground">
            Sheet music in the shared Drive folder. Search by title or arranger, or browse the folders below.
          </p>
        </div>
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

      <Card className="divide-y divide-border p-0">
        {pieces.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {filtering
              ? "No pieces match. Try another search or category."
              : "No catalogued music yet. Add music, or run “Sync with Drive” to import what’s already in the folder."}
          </p>
        ) : (
          pieces.map((p) => (
            <Link
              key={p.id}
              href={`/library/${p.folderId}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <Music className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {creditLine(p.credit, p.creditType) || "—"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {p.syncState === "ERROR" ? (
                  <TriangleAlert className="size-3.5 text-destructive" />
                ) : p.syncState === "PENDING" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                <span className="hidden sm:inline">
                  {p.files} file{p.files === 1 ? "" : "s"}
                </span>
                <Badge variant="outline">{CATEGORY_LABELS[p.category]}</Badge>
              </span>
            </Link>
          ))
        )}
      </Card>
    </section>
  );
}
