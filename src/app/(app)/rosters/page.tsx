import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { getLeadershipEmails } from "@/lib/leadership";
import { Role } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactsManager, GroupsManager, type GroupRow } from "./roster-manager";
import { ClassroomImport } from "./classroom-import";
import { CsvImport } from "./csv-import";

export const metadata = { title: "Roster — Drum Major Portal" };

export default async function RostersPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  await ensureBuiltInGroups();

  const [groupsRaw, contactsRaw, totalContacts, leadershipEmails] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ builtIn: "desc" }, { name: "asc" }],
      include: { _count: { select: { contacts: true } } },
    }),
    prisma.contact.findMany({
      orderBy: { name: "asc" },
      include: { groups: { select: { groupId: true } } },
    }),
    prisma.contact.count(),
    getLeadershipEmails(),
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

  const classGroups = groups.filter((g) => g.name !== EVERYONE).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Roster</h1>
        <p className="text-sm text-muted-foreground">
          Who gets the emails. Drum majors and admins are always included and never emailed twice.
        </p>
      </div>

      <Card className="border-t-2 border-t-primary">
        <CardHeader>
          <CardTitle>Import from Google Classroom</CardTitle>
          <CardDescription>
            Save the class&apos;s People page and upload it. Students only — teachers are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClassroomImport groups={classGroups} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>People in the band directory and their groups.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactsManager contacts={contacts} groups={groups} leadershipEmails={leadershipEmails} />
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
          <GroupsManager groups={groups} totalContacts={totalContacts} />
        </CardContent>
      </Card>

      <details className="group rounded-lg border bg-card">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium">Other ways to import (CSV)</summary>
        <div className="border-t px-6 py-4">
          <CsvImport />
        </div>
      </details>
    </div>
  );
}
