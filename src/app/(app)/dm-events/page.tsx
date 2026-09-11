import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, EventAudience } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventForm } from "../events/event-form";
import { EventList } from "../events/event-list";

export const metadata = { title: "Drum Major Events — Drum Major Portal" };

export default async function DrumMajorEventsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const events = await prisma.event.findMany({
    where: { audience: EventAudience.DRUM_MAJORS },
    orderBy: { date: "asc" },
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Drum Major Events</h1>
        <p className="text-sm text-muted-foreground">
          Leadership meetings, sectional planning, uniform checks — only drum majors and admins are told.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New drum major event</CardTitle>
          <CardDescription>Everyone on the leadership team gets an email with a calendar invite.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm audience="DRUM_MAJORS" />
        </CardContent>
      </Card>

      <EventList events={events} emailedLabel="Invited" />
    </div>
  );
}
