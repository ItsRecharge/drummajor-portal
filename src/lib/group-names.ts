// Names of the built-in class lists and the pure rules around them. No Prisma
// here so the rules run under node:test; ./groups.ts adds the database side.

// "Everyone" is virtual: it always resolves to every contact and never stores
// ContactGroup rows. It exists as a real Group row only so it can be targeted.
export const EVERYONE = "Everyone";
// The class rosters, imported from Google Classroom. A student can be in several.
export const JAZZ_GROUP = "Jazz Band";
export const CONCERT_MARCHING_GROUP = "Concert/Marching Band";
export const CONCERT_JAZZ_ONLY_GROUP = "Concert/Jazz Band Only";

// Seeded on first use (ensureBuiltInGroups) and cannot be deleted. Order = how
// pickers list them.
export const BUILTIN_GROUPS = [EVERYONE, JAZZ_GROUP, CONCERT_MARCHING_GROUP, CONCERT_JAZZ_ONLY_GROUP] as const;

export function isEveryone(group: { name: string }): boolean {
  return group.name === EVERYONE;
}

export type GroupChoice = { id: string; name: string; builtIn: boolean };

// Which class lists an event expects, from the form's checked ids. Only built-in
// lists count; Everyone already includes the rest, so it stands alone. Output
// follows BUILTIN_GROUPS order.
export function normalizeGroupSelection(
  ids: string[],
  groups: GroupChoice[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const wanted = new Set(ids);
  const order = new Map<string, number>(BUILTIN_GROUPS.map((n, i) => [n, i]));
  const picked = groups
    .filter((g) => g.builtIn && wanted.has(g.id))
    .sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
  if (picked.length === 0) return { ok: false, error: "Pick at least one class list." };
  const everyone = picked.find(isEveryone);
  return { ok: true, ids: everyone ? [everyone.id] : picked.map((g) => g.id) };
}
