import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getAttendanceGroups } from "@/lib/attendance-data";
import { Role, EventAudience } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventForm } from "../../event-form";
import { formatEventWhen } from "../../event-dates";

export const metadata = { title: "Edit band event — Drum Major Portal" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;
  const [event, groups] = await Promise.all([
    prisma.event.findUnique({ where: { id }, include: { groups: { select: { groupId: true } } } }),
    getAttendanceGroups(),
  ]);
  // Drum-major events are invited on creation; they have no edit page.
  if (!event || event.audience !== EventAudience.BAND) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Band events
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight uppercase">Edit band event</h1>
        <p className="text-sm text-muted-foreground">
          {event.title} · {formatEventWhen(event.date, event.time)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {event.attendancePublishedAt
              ? "Attendance for this event is published. Students newly expected aren't marked or emailed unless you mark them on the sheet."
              : "Emails and calendar entries already sent are not recalled."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm
            audience="BAND"
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            initial={{
              id: event.id,
              title: event.title,
              description: event.description ?? "",
              location: event.location ?? "",
              // Event dates are stored as UTC midnight.
              date: event.date.toISOString().slice(0, 10),
              time: event.time ?? "",
              groupIds: event.groups.map((g) => g.groupId),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
