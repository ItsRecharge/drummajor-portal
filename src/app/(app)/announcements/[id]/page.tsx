import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, AnnouncementStatus } from "@/generated/prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabel } from "../status";
import { approveAction, deleteAnnouncementAction } from "../actions";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;

  const ann = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      recipientGroups: { include: { group: { select: { name: true } } } },
      musicAttachments: { include: { musicPiece: { select: { title: true } } } },
    },
  });
  if (!ann) notFound();

  const [total, sent, opened] = await Promise.all([
    prisma.emailDelivery.count({ where: { announcementId: id } }),
    prisma.emailDelivery.count({ where: { announcementId: id, sentAt: { not: null } } }),
    prisma.emailDelivery.count({ where: { announcementId: id, openedAt: { not: null } } }),
  ]);

  const isAdmin = user.role === Role.ADMIN;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight uppercase">{ann.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {ann.author.name} · {ann.createdAt.toLocaleString()}
          </p>
        </div>
        <Badge variant="outline">{statusLabel(ann.status)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="prose prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: ann.bodyHtml }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Recipients: <strong>{total}</strong> · Sent: <strong>{sent}</strong> · Opened:{" "}
            <strong>{opened}</strong>
            {total > 0 ? ` (${opened}/${total})` : ""}
          </p>
          <p className="text-muted-foreground">
            Groups: {ann.recipientGroups.map((r) => r.group.name).join(", ") || "—"}
          </p>
          {ann.musicAttachments.length > 0 ? (
            <p className="text-muted-foreground">
              Music: {ann.musicAttachments.map((m) => m.musicPiece.title).join(", ")}
            </p>
          ) : null}
          {ann.scheduledAt ? (
            <p className="text-muted-foreground">Scheduled for {ann.scheduledAt.toLocaleString()}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {isAdmin && ann.status === AnnouncementStatus.PENDING_APPROVAL ? (
          <form action={approveAction}>
            <input type="hidden" name="announcementId" value={ann.id} />
            <Button type="submit">Approve &amp; release</Button>
          </form>
        ) : null}
        {ann.status === AnnouncementStatus.DRAFT ? (
          <form action={deleteAnnouncementAction}>
            <input type="hidden" name="announcementId" value={ann.id} />
            <Button type="submit" variant="outline">
              Delete draft
            </Button>
          </form>
        ) : null}
        <Link href="/announcements" className={buttonVariants({ variant: "ghost" })}>
          Back
        </Link>
      </div>
    </div>
  );
}
