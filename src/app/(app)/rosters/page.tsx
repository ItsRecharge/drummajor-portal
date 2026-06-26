import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactsManager, GroupsManager, type GroupRow } from "./roster-manager";
import { CsvImport } from "./csv-import";

export const metadata = { title: "Roster — Drum Major Portal" };

export default async function RostersPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  await ensureBuiltInGroups();

  const [groupsRaw, contactsRaw, totalContacts] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ builtIn: "desc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.contact.findMany({
      orderBy: { name: "asc" },
      include: { groups: { select: { groupId: true } } },
    }),
    prisma.contact.count(),
  ]);

  const groups: GroupRow[] = groupsRaw.map((g) => ({
    id: g.id,
    name: g.name,
    builtIn: g.builtIn,
    // Everyone is virtual: it always equals the full contact list.
    count: g.name === EVERYONE ? totalContacts : g._count.contacts,
  }));

  const contacts = contactsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    instrument: c.instrument ?? "",
    grade: c.grade ?? undefined,
    groupIds: c.groups.map((g) => g.groupId),
  }));

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold tracking-tight uppercase">Roster</h1>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>People in the band directory and their groups.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactsManager contacts={contacts} groups={groups} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>
            Built-in groups can&apos;t be deleted. &ldquo;Everyone&rdquo; always includes every contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GroupsManager groups={groups} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import CSV</CardTitle>
          <CardDescription>Bulk-add contacts with a dedupe preview before importing.</CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport />
        </CardContent>
      </Card>
    </div>
  );
}
