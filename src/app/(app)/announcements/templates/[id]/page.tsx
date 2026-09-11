import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "../template-form";

export const metadata = { title: "Edit template — Drum Major Portal" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;
  const template = await prisma.announcementTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit template</CardTitle>
        <CardDescription>Changes apply to future announcements started from this template.</CardDescription>
      </CardHeader>
      <CardContent>
        <TemplateForm template={template} />
      </CardContent>
    </Card>
  );
}
