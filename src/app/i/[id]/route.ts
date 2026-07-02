import { prisma } from "@/lib/prisma";

// Inline announcement images. Public (no auth) by design — recipients load these
// from their inboxes; the random cuid is the only handle. Content is immutable
// once created, so cache hard.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // No try/catch (unlike /t/[token]): a DB failure should surface as a 500, not a misleading 404.
  const img = await prisma.emailImage.findUnique({ where: { id } });
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
