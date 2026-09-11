import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, EventAudience } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventForm } from "./event-form";
import { EventList } from "./event-list";

export const metadata = { title: "Band Events — Drum Major Portal" };

export default async function EventsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const events = await prisma.event.findMany({
    where: { audience: EventAudience.BAND },
    orderBy: { date: "asc" },
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Band Events</h1>
        <p className="text-sm text-muted-foreground">
          Rehearsals, performances, competitions — for the whole band. Tick the box to email the roster.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New band event</CardTitle>
          <CardDescription>Leadership-only events live under Drum Major Events.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm audience="BAND" />
        </CardContent>
      </Card>

      <EventList events={events} emailedLabel="Emailed" />
    </div>
  );
}
