import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isDriveConfigured } from "@/lib/drive";
import { Role, type Prisma } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadForm } from "./upload-form";
import { deleteDocumentAction } from "./actions";

export const metadata = { title: "Document vault — Drum Major Portal" };

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const driveReady = await isDriveConfigured();

  const where: Prisma.VaultDocumentWhereInput = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { filename: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const docs = await prisma.vaultDocument.findMany({
    where,
    orderBy: [{ category: "asc" }, { title: "asc" }],
    include: { uploadedBy: { select: { name: true } } },
  });

  // Group by category so handbooks, routes, budgets, etc. sit together.
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const key = d.category || "Uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Document vault</h1>
        <p className="text-sm text-muted-foreground">
          Handbooks, parade routes, agendas, packets, and budgets — stored on Google Drive,
          separate from the music library.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a document</CardTitle>
          <CardDescription>Any file type. It&apos;s saved to the Document Vault folder on Drive.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!driveReady ? (
            <p className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
              Google Drive isn&apos;t configured yet. Finish the Drive step in setup before uploading.
            </p>
          ) : null}
          <UploadForm />
        </CardContent>
      </Card>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search title, category, filename…"
          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {docs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{query ? "No matches" : "No documents yet"}</CardTitle>
            <CardDescription>
              {query ? "Try a different search." : "Upload your first document above."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6">
          {[...groups.entries()].map(([category, items]) => (
            <div key={category} className="grid gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{category}</h2>
              <div className="grid gap-2">
                {items.map((d) => (
                  <Card key={d.id}>
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <Link
                          href={`/vault/${d.id}/file`}
                          target="_blank"
                          className="truncate font-medium hover:underline"
                        >
                          {d.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {d.filename}
                          {d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
                          {` · ${d.createdAt.toLocaleDateString()}`}
                        </p>
                      </div>
                      <form action={deleteDocumentAction}>
                        <input type="hidden" name="documentId" value={d.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
