import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel } from "./status";

export const metadata = { title: "Email Announcements — Drum Major Portal" };

export default async function AnnouncementsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      _count: { select: { deliveries: true } },
    },
  });

  const openedRows = await prisma.emailDelivery.groupBy({
    by: ["announcementId"],
    where: { openedAt: { not: null } },
    _count: { _all: true },
  });
  const opened = new Map(openedRows.map((r) => [r.announcementId, r._count._all]));

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Email Announcements</h1>
          <p className="text-sm text-muted-foreground">Drafts, scheduled, and sent history.</p>
        </div>
        <Link href="/announcements/new" className={buttonVariants()}>
          New announcement
        </Link>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No announcements yet</CardTitle>
            <CardDescription>Compose your first one to reach your roster.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {announcements.map((a) => {
            const total = a._count.deliveries;
            const opens = opened.get(a.id) ?? 0;
            return (
              <Link key={a.id} href={`/announcements/${a.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.author.name} · {a.createdAt.toLocaleDateString()}
                        {total > 0 ? ` · Opened ${opens}/${total}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{statusLabel(a.status)}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
