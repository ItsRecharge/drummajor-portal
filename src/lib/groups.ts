// Prisma side of groups. Names and pure rules live in ./group-names.ts.
import { prisma } from "@/lib/prisma";
import type { Group } from "@/generated/prisma/client";
import { BUILTIN_GROUPS, isEveryone } from "@/lib/group-names";

export {
  EVERYONE,
  JAZZ_GROUP,
  CONCERT_MARCHING_GROUP,
  CONCERT_JAZZ_ONLY_GROUP,
  BUILTIN_GROUPS,
  isEveryone,
  normalizeGroupSelection,
} from "@/lib/group-names";

// Idempotently ensure the built-in groups exist. Called from the pages that
// need them so we avoid a data migration; upsert keyed on the unique name keeps
// it safe to re-run.
export async function ensureBuiltInGroups(): Promise<void> {
  await Promise.all(
    BUILTIN_GROUPS.map((name) =>
      prisma.group.upsert({
        where: { name },
        update: { builtIn: true },
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

// Resolve a group's member contact IDs. Used to fan out announcements.
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
