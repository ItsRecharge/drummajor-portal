import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getFileStream } from "@/lib/drive";

// Auth-gated proxy that streams a vault document from Drive so it can be previewed
// or downloaded inline without exposing the Drive file id or sharing it publicly.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await prisma.vaultDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });

  try {
    const { stream, mimeType, name } = await getFileStream(doc.driveFileId);
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
