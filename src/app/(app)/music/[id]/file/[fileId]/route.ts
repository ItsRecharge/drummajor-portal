import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getFileStream } from "@/lib/drive";

// Auth-gated proxy that streams a music PDF from Drive so it can be previewed
// inline without exposing Drive file ids or sharing the file publicly.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id, fileId } = await params;
  const file = await prisma.musicFile.findFirst({ where: { id: fileId, musicPieceId: id } });
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const { stream, mimeType, name } = await getFileStream(file.driveFileId);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Drive unavailable", { status: 502 });
  }
}
