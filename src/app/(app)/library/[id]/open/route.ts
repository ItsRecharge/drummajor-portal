import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { shareAnyoneWithLink } from "@/lib/drive";
import { Role } from "@/generated/prisma/client";

// Resolves a Library item's Drive link and redirects to it. Items migrated from
// the old Music/Vault tables have a driveId but no webViewLink yet; we fetch and
// persist the shareable link on first open.
export const dynamic = "force-dynamic";

const ALLOWED = new Set<Role>([Role.ADMIN, Role.DRUM_MAJOR, Role.LIBRARIAN]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth || !ALLOWED.has(auth.user.role)) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item || !item.driveId) return new Response("Not ready", { status: 404 });

  let link = item.webViewLink;
  if (!link) {
    link = await shareAnyoneWithLink(item.driveId);
    await prisma.libraryItem.update({ where: { id }, data: { webViewLink: link } });
  }
  return Response.redirect(link, 302);
}
