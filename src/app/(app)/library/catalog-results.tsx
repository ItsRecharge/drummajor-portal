"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Music, Loader2, TriangleAlert, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CATEGORY_LABELS } from "@/lib/music-naming";
import { loadMorePiecesAction, type PieceRow } from "./actions";

function creditLine(credit: string | null, creditType: "ARRANGER" | "COMPOSER" | null): string {
  if (!credit) return "";
  return creditType === "ARRANGER" ? `arr. ${credit}` : credit;
}

// First page comes from the server; "Load more" appends the next page via a
// server action so the whole catalog is never rendered at once.
export function CatalogResults({
  initial,
  total,
  q,
  category,
  filtering,
}: {
  initial: PieceRow[];
  total: number;
  q: string;
  category: string | null;
  filtering: boolean;
}) {
  const [rows, setRows] = useState<PieceRow[]>(initial);
  const [pending, startTransition] = useTransition();
  const remaining = total - rows.length;

  function loadMore() {
    startTransition(async () => {
      try {
        const res = await loadMorePiecesAction(q, category, rows.length);
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.rows.filter((r) => !seen.has(r.id))];
        });
      } catch {
        toast.error("Couldn't load more right now.");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {total === 0
          ? filtering
            ? "No pieces match. Try another search or category."
            : "No catalogued music yet. Add music, or run “Sync with Drive” to import what’s already in the folder."
          : `Showing ${rows.length} of ${total} piece${total === 1 ? "" : "s"}`}
      </p>
      {rows.length > 0 ? (
        <Card className="divide-y divide-border p-0">
          {rows.map((p) => (
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
          ))}
        </Card>
      ) : null}
      {remaining > 0 ? (
        <div>
          <Button type="button" variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ChevronDown data-icon="inline-start" />}
            {pending ? "Loading…" : `Load ${Math.min(remaining, 25)} more`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
