import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EventForm } from "./event-form";
import { deleteEventAction } from "./actions";

export const metadata = { title: "Events — Drum Major Portal" };

export default async function EventsPage() {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const events = await prisma.event.findMany({ orderBy: { date: "asc" } });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Events</h1>
        <p className="text-sm text-muted-foreground">Schedule rehearsals, competitions, and more.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New event</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm />
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>No events yet.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {events.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.date.toLocaleDateString()}
                    {e.time ? ` · ${e.time}` : ""}
                    {e.description ? ` · ${e.description}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {e.notify ? <Badge variant="outline">Notified</Badge> : null}
                  <form action={deleteEventAction}>
                    <input type="hidden" name="eventId" value={e.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Delete
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
