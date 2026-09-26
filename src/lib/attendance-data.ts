// Prisma-facing helpers for attendance. Pure logic lives in ./attendance.ts and
// the live pub/sub in ./attendance-live.ts.
import { prisma } from "@/lib/prisma";
import { BUILTIN_GROUPS, ensureBuiltInGroups, EVERYONE, isEveryone } from "@/lib/groups";
import {
  buildSheetRows,
  summarizeAttendance,
  type AttendanceStatus,
  type SheetSnapshot,
  type SummaryCsvRow,
} from "@/lib/attendance";
import { broadcastFrame, sseFrame } from "@/lib/attendance-live";
import type { Contact, Group } from "@/generated/prisma/client";

function builtInOrder(groups: Group[]): Group[] {
  const order = new Map<string, number>(BUILTIN_GROUPS.map((n, i) => [n, i]));
  return groups.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

// The built-in class lists, in the order the pickers show them.
export async function getAttendanceGroups(): Promise<Group[]> {
  await ensureBuiltInGroups();
  return builtInOrder(await prisma.group.findMany({ where: { builtIn: true } }));
}

// `?group=` wins, then the saved group, then Everyone. (Season summary page.)
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
  return getGroupsContacts([group]);
}

// Contacts in any of several groups, alphabetical. Everyone (or no group at
// all) = the whole roster.
export function getGroupsContacts(groups: Group[]): Promise<Contact[]> {
  const everyone = groups.length === 0 || groups.some(isEveryone);
  return prisma.contact.findMany({
    where: everyone ? {} : { groups: { some: { groupId: { in: groups.map((g) => g.id) } } } },
    orderBy: { name: "asc" },
  });
}

// The class lists an event expects and everyone in them. No rows = Everyone.
export async function getEventRoster(eventId: string): Promise<{ groups: Group[]; contacts: Contact[] }> {
  const links = await prisma.eventGroup.findMany({ where: { eventId }, include: { group: true } });
  let groups = links.map((l) => l.group);
  if (groups.length === 0) {
    await ensureBuiltInGroups();
    const everyone = await prisma.group.findUnique({ where: { name: EVERYONE } });
    groups = everyone ? [everyone] : [];
  }
  return { groups: builtInOrder(groups), contacts: await getGroupsContacts(groups) };
}

// Everything the sheet shows, for the page's first render and for every SSE push.
export async function loadSheetSnapshot(eventId: string): Promise<SheetSnapshot | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      attendancePublishedBy: { select: { name: true } },
      attendance: {
        select: {
          contactId: true,
          status: true,
          absenceEmailedAt: true,
          checkedInAt: true,
          contact: { select: { name: true, instrument: true } },
        },
      },
      checkIns: { select: { contactId: true, flags: true } },
      _count: { select: { checkIns: true } },
    },
  });
  if (!event) return null;
  const { groups, contacts } = await getEventRoster(eventId);
  // Two phones claiming one student both carry flags; the row shows the union.
  const flagsByContact = new Map<string, string[]>();
  for (const c of event.checkIns) {
    flagsByContact.set(c.contactId, [...new Set([...(flagsByContact.get(c.contactId) ?? []), ...c.flags])]);
  }
  return {
    version: Date.now(),
    rows: buildSheetRows(
      contacts,
      event.attendance.map((r) => ({ ...r, status: r.status as AttendanceStatus })),
      flagsByContact,
    ),
    groups: groups.map((g) => g.name),
    takenAt: event.attendanceTakenAt?.toISOString() ?? null,
    publishedAt: event.attendancePublishedAt?.toISOString() ?? null,
    publishedBy: event.attendancePublishedBy?.name ?? null,
    eventDay: event.date.toISOString().slice(0, 10),
    checkIn: {
      openedAt: event.checkInOpenedAt?.toISOString() ?? null,
      closedAt: event.checkInClosedAt?.toISOString() ?? null,
      count: event._count.checkIns,
    },
  };
}

// Push the sheet to every open tab. Loads a fresh snapshot unless given one.
export async function broadcastSheet(eventId: string, snapshot?: SheetSnapshot | null): Promise<void> {
  const snap = snapshot ?? (await loadSheetSnapshot(eventId));
  if (snap) broadcastFrame(eventId, sseFrame("snapshot", snap));
}

export type SummaryTableRow = SummaryCsvRow & { id: string };

// Season totals for every contact in the group, over published sheets only (an
// in-progress sheet would otherwise count its unmarked students as absent),
// plus how many sheets have been published.
export async function getAttendanceSummary(
  group: Group,
): Promise<{ rows: SummaryTableRow[]; eventsTaken: number }> {
  const contacts = await getGroupContacts(group);
  const ids = contacts.map((c) => c.id);
  const published = { attendancePublishedAt: { not: null } };
  const [records, eventsTaken] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { contactId: { in: ids }, event: published },
      select: { contactId: true, status: true },
    }),
    prisma.event.count({ where: published }),
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
