import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HandoffForm } from "./handoff-form";
import { deleteHandoffNoteAction } from "./actions";

export const metadata = { title: "Handoff center — Drum Major Portal" };

const CATEGORY: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  WHAT_WORKED: { label: "What worked", variant: "default" },
  WHAT_DIDNT: { label: "What didn't", variant: "secondary" },
  TIP: { label: "Tip", variant: "outline" },
};

export default async function HandoffPage() {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const currentYear = new Date().getFullYear();

  const [notes, announcements, music, events] = await Promise.all([
    prisma.handoffNote.findMany({
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      include: { author: { select: { name: true } } },
    }),
    prisma.announcement.count(),
    prisma.musicPiece.count(),
    prisma.event.count(),
  ]);

  // Group notes by year, preserving the desc order from the query.
  const byYear = new Map<number, typeof notes>();
  for (const n of notes) {
    if (!byYear.has(n.year)) byYear.set(n.year, []);
    byYear.get(n.year)!.push(n);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Leadership handoff center</h1>
        <p className="text-sm text-muted-foreground">
          Year-over-year institutional memory: what worked, what didn&apos;t, and tips for the next
          drum-major class.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a handoff note</CardTitle>
        </CardHeader>
        <CardContent>
          <HandoffForm defaultYear={currentYear} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Archive</CardTitle>
          <CardDescription>Everything past classes built, still here for reference.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Link href="/announcements" className="rounded-md border px-3 py-1.5 hover:bg-accent/40">
            {announcements} announcement(s)
          </Link>
          <Link href="/music" className="rounded-md border px-3 py-1.5 hover:bg-accent/40">
            {music} piece(s) of music
          </Link>
          <Link href="/events" className="rounded-md border px-3 py-1.5 hover:bg-accent/40">
            {events} event(s)
          </Link>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>No handoff notes yet. Add the first one above.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <div key={year} className="grid gap-2">
            <h2 className="text-lg font-semibold">{year}</h2>
            {items.map((n) => {
              const cat = CATEGORY[n.category] ?? { label: n.category, variant: "outline" as const };
              const canDelete = n.authorId === user.id || user.role === Role.ADMIN;
              return (
                <Card key={n.id}>
                  <CardContent className="grid gap-2 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={cat.variant}>{cat.label}</Badge>
                        <span className="font-medium">{n.title}</span>
                      </div>
                      {canDelete ? (
                        <form action={deleteHandoffNoteAction}>
                          <input type="hidden" name="noteId" value={n.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            Delete
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <div
                      className="prose prose-sm max-w-none text-sm [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: n.bodyHtml }}
                    />
                    {n.author ? (
                      <p className="text-xs text-muted-foreground">— {n.author.name}</p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
