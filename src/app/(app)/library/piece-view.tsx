import Link from "next/link";
import { ExternalLink, FileText, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBreadcrumbs } from "@/lib/library";
import { piecePartsSorted } from "@/lib/music-catalog";
import { CATEGORY_LABELS, type CreditType, type MusicCategory } from "@/lib/music-naming";
import { AddPartsForm, DeletePieceButton, EditPieceDialog, EditPartsDialog, type PieceMeta } from "./piece-forms";
import { ItemActions } from "./item-actions";

function formatBytes(bytes: bigint | null): string {
  if (bytes == null) return "";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export async function PieceView({
  folder,
  piece,
}: {
  folder: { id: string; name: string; syncState: "PENDING" | "SYNCED" | "ERROR"; syncError: string | null; webViewLink: string | null };
  piece: { id: string; title: string; credit: string | null; creditType: CreditType | null; category: MusicCategory; updatedAt: Date };
}) {
  const [parts, crumbs] = await Promise.all([piecePartsSorted(folder.id, piece.category), getBreadcrumbs(folder.id)]);
  const meta: PieceMeta = { id: piece.id, folderId: folder.id, title: piece.title, credit: piece.credit, creditType: piece.creditType, category: piece.category };
  const credit = piece.credit ? (piece.creditType === "ARRANGER" ? `arr. ${piece.credit}` : piece.credit) : null;

  return (
    <div className="grid gap-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={c.id ?? "root"} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted-foreground/50">/</span> : null}
              {last ? (
                <span className="font-medium text-foreground">{c.name}</span>
              ) : (
                <Link href={c.id ? `/library/${c.id}` : "/library"} className="hover:text-foreground hover:underline">
                  {c.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <section className="field-grid rounded-lg border bg-card px-6 py-6">
        <p className="eyebrow">{CATEGORY_LABELS[piece.category]}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight uppercase">{piece.title}</h1>
        {credit ? <p className="text-muted-foreground">{credit}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {folder.syncState === "SYNCED" ? (
            <Link href={`/library/${folder.id}/open`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ExternalLink data-icon="inline-start" />
              Open folder in Drive
            </Link>
          ) : folder.syncState === "ERROR" ? (
            <span className="flex items-center gap-1 text-sm text-destructive">
              <TriangleAlert className="size-4" /> Folder not on Drive yet: {folder.syncError ?? "sync failed"}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Creating folder in Drive…
            </span>
          )}
          <EditPieceDialog piece={meta} />
          <DeletePieceButton piece={meta} />
        </div>
      </section>

      <Card className="p-0">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm tracking-wide uppercase">Parts</CardTitle>
          <CardDescription>In concert order. Files open in Google Drive.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {parts.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No part files yet.</p>
          ) : (
            parts.map((p) => {
              const synced = p.syncState === "SYNCED";
              const label = (
                <span className="flex min-w-0 items-center gap-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.from ? (p.to ? `${p.from} → ${p.to}` : p.from) : p.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {p.name}
                      {p.sizeBytes != null ? ` · ${formatBytes(p.sizeBytes)}` : ""}
                    </span>
                  </span>
                </span>
              );
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  {synced ? (
                    <Link href={`/library/${p.id}/open`} target="_blank" className="min-w-0 flex-1 hover:underline">
                      {label}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 opacity-70">{label}</span>
                  )}
                  <span className="flex shrink-0 items-center gap-1">
                    {p.syncState === "ERROR" ? (
                      <span className="flex items-center gap-1 text-xs text-destructive" title={p.syncError ?? undefined}>
                        <TriangleAlert className="size-3.5" /> Upload failed
                      </span>
                    ) : !synced ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Uploading…
                      </span>
                    ) : null}
                    <EditPartsDialog fileId={p.id} fileName={p.name} piece={meta} initial={[p.from, p.to].filter((x): x is string => !!x)} />
                    <ItemActions id={p.id} name={p.name} synced={synced} errored={p.syncState === "ERROR"} />
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add parts</CardTitle>
          <CardDescription>Upload more PDFs; tick the parts each one contains and the portal names it.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddPartsForm piece={meta} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Folder: <span className="font-mono">{folder.name}</span> · <Badge variant="outline">{CATEGORY_LABELS[piece.category]}</Badge>
      </p>
    </div>
  );
}
