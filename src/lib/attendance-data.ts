// Prisma-facing helpers for attendance. Pure logic lives in ./attendance.ts.
import { prisma } from "@/lib/prisma";
import { BUILTIN_GROUPS, ensureBuiltInGroups, EVERYONE, isEveryone } from "@/lib/groups";
import { summarizeAttendance, type AttendanceStatus, type SummaryCsvRow } from "@/lib/attendance";
import type { Contact, Group } from "@/generated/prisma/client";

// The three built-in class lists, in the order the picker shows them.
export async function getAttendanceGroups(): Promise<Group[]> {
  await ensureBuiltInGroups();
  const groups = await prisma.group.findMany({ where: { builtIn: true } });
  const order = new Map<string, number>(BUILTIN_GROUPS.map((n, i) => [n, i]));
  return groups.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

// `?group=` wins, then the event's saved group, then Everyone.
export function pickAttendanceGroup(
  groups: Group[],
  requestedId: string | undefined,
  savedId: string | null | undefined,
): Group {
  return (
    groups.find((g) => g.id === requestedId) ??
    groups.find((g) => g.id === savedId) ??
    groups.find((g) => g.name === EVERYONE) ??
    groups[0]
  );
}

// Contacts in a group, alphabetical. Everyone = the whole roster.
export function getGroupContacts(group: Group): Promise<Contact[]> {
  return prisma.contact.findMany({
    where: isEveryone(group) ? {} : { groups: { some: { groupId: group.id } } },
    orderBy: { name: "asc" },
  });
}

export type SummaryTableRow = SummaryCsvRow & { id: string };

// Season totals for every contact in the group, plus how many events have a
// saved sheet (for the "N events taken" line).
export async function getAttendanceSummary(
  group: Group,
): Promise<{ rows: SummaryTableRow[]; eventsTaken: number }> {
  const contacts = await getGroupContacts(group);
  const ids = contacts.map((c) => c.id);
  const [records, eventsTaken] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { contactId: { in: ids } },
      select: { contactId: true, status: true },
    }),
    prisma.event.count({ where: { attendanceTakenAt: { not: null } } }),
  ]);
  const summary = summarizeAttendance(
    records.map((r) => ({ contactId: r.contactId, status: r.status as AttendanceStatus })),
    ids,
  );
  const rows = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    instrument: c.instrument ?? "",
    ...summary.get(c.id)!,
  }));
  return { rows, eventsTaken };
}

export function csvResponse(text: string, filename: string): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
