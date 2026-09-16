import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, EventAudience } from "@/generated/prisma/client";
import { getAttendanceGroups, getGroupContacts, pickAttendanceGroup } from "@/lib/attendance-data";
import type { AttendanceStatus } from "@/lib/attendance";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupPicker } from "@/components/group-picker";
import { formatEventWhen } from "../../event-dates";
import { AttendanceSheet, type SheetRow } from "./attendance-sheet";

export const metadata = { title: "Attendance — Drum Major Portal" };

export default async function EventAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const [{ id }, { group: requestedGroupId }] = await Promise.all([params, searchParams]);

  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendance: { select: { contactId: true, status: true } } },
  });
  if (!event || event.audience !== EventAudience.BAND) notFound();

  const groups = await getAttendanceGroups();
  const group = pickAttendanceGroup(groups, requestedGroupId, event.attendanceGroupId);
  const contacts = await getGroupContacts(group);
  const saved = new Map(event.attendance.map((r) => [r.contactId, r.status as AttendanceStatus]));
  // Fresh sheet: everyone starts Absent; tap the students who are here.
  const rows: SheetRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    instrument: c.instrument ?? "",
    status: saved.get(c.id) ?? "ABSENT",
  }));

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Band events
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight uppercase">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          {event.title} · {formatEventWhen(event.date, event.time)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Roll call</CardTitle>
            <CardDescription>
              {event.attendanceTakenAt
                ? `Last saved ${event.attendanceTakenAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`
                : "Not taken yet. Everyone starts as absent."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GroupPicker groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group.id} />
            {event.attendanceTakenAt ? (
              <a href={`/events/${event.id}/attendance/export`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download /> CSV
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {/* Key resets client state when the group changes or a save lands. */}
          <AttendanceSheet
            key={`${group.id}:${event.attendanceTakenAt?.getTime() ?? 0}`}
            eventId={event.id}
            groupId={group.id}
            rows={rows}
          />
        </CardContent>
      </Card>
    </div>
  );
}
