import { prisma } from "@/lib/prisma";

// 1×1 transparent GIF served for every announcement open-tracking pixel. The first
// request for a delivery's token records openedAt. Public (no auth) by design — the
// token is the only thing that ties a hit to a delivery.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trackingToken = token.replace(/\.gif$/i, "");
  try {
    const delivery = await prisma.emailDelivery.findUnique({ where: { trackingToken } });
    if (delivery && !delivery.openedAt) {
      await prisma.emailDelivery.update({
        where: { trackingToken },
        data: { openedAt: new Date() },
      });
    }
  } catch {
    // Never let tracking break image loading.
  }
  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
    },
  });
}
