import { prisma } from "@/lib/prisma";
import type { Group } from "@/generated/prisma/client";

// The built-in "Everyone" group is virtual: it always resolves to every contact
// and never stores ContactGroup rows. It exists as a real Group row only so it can
// be targeted by announcements (Stage 3). It cannot be edited or emptied.
export const EVERYONE = "Everyone";

// Built-in groups are seeded on first roster-page load and cannot be deleted.
export const BUILTIN_GROUPS = [EVERYONE, "Marching", "Concert", "Jazz"] as const;

export function isEveryone(group: { name: string }): boolean {
  return group.name === EVERYONE;
}

// Idempotently ensure the built-in groups exist. Called from the roster page so we
// avoid a data migration; upsert keyed on the unique name keeps it safe to re-run.
export async function ensureBuiltInGroups(): Promise<void> {
  await Promise.all(
    BUILTIN_GROUPS.map((name) =>
      prisma.group.upsert({
        where: { name },
        update: {},
        create: { name, builtIn: true },
      }),
    ),
  );
}

// Member count for a group. Everyone = total contacts; everything else = its
// stored ContactGroup rows.
export async function groupMemberCount(group: Group): Promise<number> {
  if (isEveryone(group)) return prisma.contact.count();
  return prisma.contactGroup.count({ where: { groupId: group.id } });
}

// Resolve a group's member contact IDs. Reused by Stage 3 to fan out announcements.
export async function resolveGroupMemberIds(group: Group): Promise<string[]> {
  if (isEveryone(group)) {
    const contacts = await prisma.contact.findMany({ select: { id: true } });
    return contacts.map((c) => c.id);
  }
  const links = await prisma.contactGroup.findMany({
    where: { groupId: group.id },
    select: { contactId: true },
  });
  return links.map((l) => l.contactId);
}
