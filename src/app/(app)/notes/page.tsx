import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { NoteBoard } from "./board";

export const metadata = { title: "Idea board — Drum Major Portal" };

export default async function NotesPage() {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { name: true } },
      votes: { select: { userId: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  const data = notes.map((n) => ({
    id: n.id,
    text: n.text,
    color: n.color,
    category: n.category,
    x: n.x,
    y: n.y,
    authorName: n.anonymous ? null : n.author.name,
    canDelete: n.authorId === user.id || user.role === Role.ADMIN,
    votes: n.votes.length,
    voted: n.votes.some((v) => v.userId === user.id),
    comments: n.comments.map((c) => ({
      id: c.id,
      text: c.text,
      author: c.author.name,
      createdAt: c.createdAt.toLocaleString(),
    })),
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Idea board</h1>
        <p className="text-sm text-muted-foreground">
          A sticky-note wall for the leadership team. Drag to arrange, upvote the good ones,
          and comment to discuss.
        </p>
      </div>
      <NoteBoard notes={data} />
    </div>
  );
}
