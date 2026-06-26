import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Composer, type GroupOption } from "../composer";

export const metadata = { title: "New announcement — Drum Major Portal" };

export default async function NewAnnouncementPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  await ensureBuiltInGroups();

  const [groupsRaw, totalContacts, folders, templates] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ builtIn: "desc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.contact.count(),
    prisma.libraryItem.findMany({
      where: { type: "FOLDER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.announcementTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, bodyHtml: true },
    }),
  ]);

  const groups: GroupOption[] = groupsRaw.map((g) => ({
    id: g.id,
    name: g.name,
    count: g.name === EVERYONE ? totalContacts : g._count.contacts,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>New announcement</CardTitle>
        <CardDescription>
          Compose a message, pick recipient groups, and send now or schedule for later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Composer
          groups={groups}
          music={folders.map((f) => ({ id: f.id, title: f.name }))}
          templates={templates}
        />
      </CardContent>
    </Card>
  );
}
