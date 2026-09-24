import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { loadSheetSnapshot } from "@/lib/attendance-data";
import { Role, EventAudience } from "@/generated/prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventWhen } from "../../event-dates";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata = { title: "Attendance — Drum Major Portal" };

export default async function EventAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.audience !== EventAudience.BAND) notFound();
  const snapshot = await loadSheetSnapshot(id);
  if (!snapshot) notFound();

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
              Expected: {snapshot.groups.join(" + ")} · {snapshot.rows.length} student
              {snapshot.rows.length === 1 ? "" : "s"}. Every tap saves at once and shows up for every drum major on
              this sheet. Absent students are emailed only when someone publishes it.
            </CardDescription>
          </div>
          {snapshot.takenAt ? (
            <a href={`/events/${event.id}/attendance/export`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> CSV
            </a>
          ) : null}
        </CardHeader>
        <CardContent>
          <AttendanceSheet eventId={event.id} initial={snapshot} viewerName={user.name} />
        </CardContent>
      </Card>
    </div>
  );
}
