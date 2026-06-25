import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieceForm } from "../music-form";
import { FileUploadForm } from "../music-file-form";
import { editPieceAction, deletePieceAction } from "../actions";

export default async function MusicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN);
  const { id } = await params;

  const piece = await prisma.musicPiece.findUnique({
    where: { id },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });
  if (!piece) notFound();

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="truncate text-2xl font-semibold">{piece.title}</h1>
        <Link href="/music" className={buttonVariants({ variant: "ghost" })}>
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>Preview, replace, or add PDFs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {piece.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files yet.</p>
          ) : (
            piece.files.map((f) => (
              <div key={f.id} className="grid gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {f.filename} <span className="text-muted-foreground">v{f.version}</span>
                  </span>
                  <FileUploadForm pieceId={piece.id} replaceFileId={f.id} label="Replace" />
                </div>
                <object
                  data={`/music/${piece.id}/file/${f.id}`}
                  type="application/pdf"
                  className="h-96 w-full rounded border"
                >
                  <a href={`/music/${piece.id}/file/${f.id}`} className="text-sm underline">
                    Open {f.filename}
                  </a>
                </object>
              </div>
            ))
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Add files</p>
            <FileUploadForm pieceId={piece.id} label="Upload PDFs" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <PieceForm
            action={editPieceAction}
            submitLabel="Save changes"
            defaults={{
              id: piece.id,
              title: piece.title,
              composer: piece.composer ?? "",
              arranger: piece.arranger ?? "",
              ensemble: piece.ensemble ?? "",
              tags: piece.tags.join(", "),
              notes: piece.notes ?? "",
            }}
          />
        </CardContent>
      </Card>

      <form action={deletePieceAction}>
        <input type="hidden" name="pieceId" value={piece.id} />
        <Button type="submit" variant="outline">
          Delete piece
        </Button>
      </form>
    </div>
  );
}
