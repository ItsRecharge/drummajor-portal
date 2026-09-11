import Link from "next/link";
import { Plus, Pencil, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ensureDefaultTemplates } from "@/lib/announcement-templates";
import { Role } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteTemplateButton } from "./delete-template-button";

export const metadata = { title: "Templates — Drum Major Portal" };

function snippet(html: string, max = 140): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function TemplatesPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  await ensureDefaultTemplates().catch((err) =>
    console.error("[announcements] ensureDefaultTemplates failed:", err),
  );
  const templates = await prisma.announcementTemplate.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Announcement templates</h1>
          <p className="text-sm text-muted-foreground">
            Start an announcement from a saved message, or edit the template itself. Save new ones from the
            composer with “Save as template”.
          </p>
        </div>
        <Link href="/announcements/new" className={buttonVariants({ variant: "outline" })}>
          <Plus data-icon="inline-start" />
          Blank announcement
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No templates yet</CardTitle>
            <CardDescription>Write an announcement and use “Save as template”.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription className="truncate">Subject: {t.subject}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-muted-foreground">{snippet(t.bodyHtml)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Link href={`/announcements/new?template=${t.id}`} className={buttonVariants({ size: "sm" })}>
                    <Send data-icon="inline-start" />
                    Use template
                  </Link>
                  <Link
                    href={`/announcements/templates/${t.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Link>
                  <DeleteTemplateButton id={t.id} name={t.name} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
