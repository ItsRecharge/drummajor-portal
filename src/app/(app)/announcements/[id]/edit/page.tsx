import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, AnnouncementStatus } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Composer } from "../../composer";
import { loadComposerData } from "../../composer-data";

export const metadata = { title: "Edit draft — Drum Major Portal" };

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;
  const ann = await prisma.announcement.findUnique({
    where: { id },
    include: {
      recipientGroups: { select: { groupId: true } },
      musicAttachments: { select: { libraryItemId: true } },
    },
  });
  if (!ann) notFound();
  // Only drafts are editable; anything already queued shows its detail page.
  if (ann.status !== AnnouncementStatus.DRAFT) redirect(`/announcements/${id}`);

  const data = await loadComposerData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit draft</CardTitle>
        <CardDescription>Changes are saved when you send, schedule, or save the draft.</CardDescription>
      </CardHeader>
      <CardContent>
        <Composer
          {...data}
          initial={{
            id: ann.id,
            subject: ann.subject,
            bodyHtml: ann.bodyHtml,
            groupIds: ann.recipientGroups.map((g) => g.groupId),
            musicIds: ann.musicAttachments.map((m) => m.libraryItemId),
            scheduledAt: ann.scheduledAt?.toISOString() ?? null,
          }}
        />
      </CardContent>
    </Card>
  );
}
