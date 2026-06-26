import Link from "next/link";
import { Folder, FileText, Loader2, TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { listChildren, getBreadcrumbs } from "@/lib/library";
import { LibraryToolbar } from "./library-toolbar";
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

export async function LibraryBrowser({ folderId }: { folderId: string | null }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const [items, crumbs] = await Promise.all([listChildren(folderId), getBreadcrumbs(folderId)]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Library</h1>
        <p className="text-sm text-muted-foreground">
          Band files and music, organized like Drive. Items open in Google Drive.
        </p>
      </div>

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={c.id ?? "root"} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted-foreground/50">/</span> : null}
              {last ? (
                <span className="font-medium text-foreground">{c.name}</span>
              ) : (
                <Link
                  href={c.id ? `/library/${c.id}` : "/library"}
                  className="hover:text-foreground hover:underline"
                >
                  {c.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <LibraryToolbar parentId={folderId} />

      <Card className="divide-y divide-border p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            This folder is empty. Create a folder or upload files to get started.
          </p>
        ) : (
          items.map((item) => {
            const isFolder = item.type === "FOLDER";
            const synced = item.syncState === "SYNCED";
            const errored = item.syncState === "ERROR";
            const meta = [
              item.uploadedBy?.name,
              !isFolder ? formatBytes(item.sizeBytes) : null,
            ]
              .filter(Boolean)
              .join(" · ");

            const label = (
              <span className="flex min-w-0 items-center gap-3">
                {isFolder ? (
                  <Folder className="size-5 shrink-0 text-primary" />
                ) : (
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  {item.note ? (
                    <span className="block truncate text-xs text-muted-foreground">{item.note}</span>
                  ) : meta ? (
                    <span className="block truncate text-xs text-muted-foreground">{meta}</span>
                  ) : null}
                </span>
              </span>
            );

            return (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                {isFolder ? (
                  <Link href={`/library/${item.id}`} className="min-w-0 flex-1 hover:underline">
                    {label}
                  </Link>
                ) : synced ? (
                  <Link
                    href={`/library/${item.id}/open`}
                    target="_blank"
                    className="min-w-0 flex-1 hover:underline"
                  >
                    {label}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 opacity-70">{label}</span>
                )}

                <span className="flex shrink-0 items-center gap-2">
                  {errored ? (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <TriangleAlert className="size-3.5" /> Sync failed
                    </span>
                  ) : !synced ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Uploading…
                    </span>
                  ) : null}
                  <ItemActions id={item.id} name={item.name} synced={synced} />
                </span>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
