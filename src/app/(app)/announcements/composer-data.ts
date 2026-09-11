import { prisma } from "@/lib/prisma";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { ensureDefaultTemplates } from "@/lib/announcement-templates";
import type { GroupOption, MusicOption, TemplateOption } from "./composer";

// Everything the composer needs, shared by the new and edit pages.
export async function loadComposerData(): Promise<{
  groups: GroupOption[];
  music: MusicOption[];
  templates: TemplateOption[];
}> {
  await ensureBuiltInGroups();
  await ensureDefaultTemplates().catch((err) =>
    console.error("[announcements] ensureDefaultTemplates failed:", err),
  );

  const [groupsRaw, totalContacts, folders, templates] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ builtIn: "desc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.contact.count(),
    prisma.libraryItem.findMany({
      where: { type: "FOLDER" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
    prisma.announcementTemplate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, bodyHtml: true },
    }),
  ]);

  return {
    groups: groupsRaw.map((g) => ({
      id: g.id,
      name: g.name,
      count: g.name === EVERYONE ? totalContacts : g._count.contacts,
    })),
    music: folders.map((f) => ({ id: f.id, title: f.name, subtitle: f.parent?.name ?? undefined })),
    templates,
  };
}
