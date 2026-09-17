import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, EventAudience } from "@/generated/prisma/client";
import { getAttendanceGroups } from "@/lib/attendance-data";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { Globe } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventForm } from "./event-form";
import { EventList } from "./event-list";

export const metadata = { title: "Band Events — Drum Major Portal" };

export default async function EventsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const [events, groups] = await Promise.all([
    prisma.event.findMany({ where: { audience: EventAudience.BAND }, orderBy: { date: "asc" } }),
    getAttendanceGroups(),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Band Events</h1>
          <p className="text-sm text-muted-foreground">
            Rehearsals, performances, competitions — for the whole band. Everything here is on the public calendar.
          </p>
        </div>
        <Link href="/calendar" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Globe data-icon="inline-start" /> Public calendar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New band event</CardTitle>
          <CardDescription>Leadership-only events live under Drum Major Events.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm audience="BAND" groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
        </CardContent>
      </Card>

      <EventList events={events} emailedLabel="Emailed" showAttendance />
    </div>
  );
}
