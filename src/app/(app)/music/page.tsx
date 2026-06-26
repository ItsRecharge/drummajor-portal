import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, type Prisma } from "@/generated/prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Music — Drum Major Portal" };

export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where: Prisma.MusicPieceWhereInput = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { composer: { contains: query, mode: "insensitive" } },
          { arranger: { contains: query, mode: "insensitive" } },
          { tags: { has: query } },
        ],
      }
    : {};

  const pieces = await prisma.musicPiece.findMany({
    where,
    orderBy: { title: "asc" },
    include: { _count: { select: { files: true } } },
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Music library</h1>
          <p className="text-sm text-muted-foreground">Search and manage the band&apos;s catalog.</p>
        </div>
        <Link href="/music/new" className={buttonVariants()}>
          Add piece
        </Link>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search title, composer, arranger, tag…"
          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {pieces.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{query ? "No matches" : "No music yet"}</CardTitle>
            <CardDescription>
              {query ? "Try a different search." : "Add your first piece to get started."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {pieces.map((p) => (
            <Link key={p.id} href={`/music/${p.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[p.composer, p.arranger, p.ensemble].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{p._count.files} file(s)</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
