import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Composer } from "../composer";
import { loadComposerData } from "../composer-data";

export const metadata = { title: "New announcement — Drum Major Portal" };

export default async function NewAnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { template } = await searchParams;
  const data = await loadComposerData();
  const initialTemplateId = template && data.templates.some((t) => t.id === template) ? template : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New announcement</CardTitle>
        <CardDescription>
          Pick who it&apos;s for, write the message, then send now, schedule, or save a draft.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Composer {...data} initialTemplateId={initialTemplateId} />
      </CardContent>
    </Card>
  );
}
