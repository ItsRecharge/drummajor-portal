import { MapPin, Clock } from "lucide-react";
import type { Event } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { DeleteEventButton } from "./delete-event-button";
import { formatEventDate, formatEventTime, todayUtc } from "./event-dates";

// Upcoming first (soonest at the top), past events tucked into a disclosure.
export function EventList({
  events,
  emailedLabel,
}: {
  events: Event[];
  emailedLabel: string;
}) {
  const today = todayUtc();
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.getTime() - a.date.getTime());

  const row = (e: Event) => (
    <Card key={e.id}>
      <CardContent className="flex items-center gap-4 py-3">
        <div className="grid w-14 shrink-0 place-items-center rounded-md border bg-muted/40 py-1.5 leading-none">
          <span className="font-mono text-[0.6rem] tracking-widest text-primary uppercase">
            {formatEventDate(e.date, { month: "short", day: undefined })}
          </span>
          <span className="stat-numeral !text-2xl">{formatEventDate(e.date, { month: undefined, day: "numeric" })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{e.title}</p>
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{formatEventDate(e.date, { weekday: "long" })}</span>
            {e.time ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatEventTime(e.time)}
              </span>
            ) : null}
            {e.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {e.location}
              </span>
            ) : null}
          </p>
          {e.description ? <p className="mt-1 text-sm text-muted-foreground">{e.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {e.notify ? <Badge variant="outline">{emailedLabel}</Badge> : null}
          <DeleteEventButton id={e.id} title={e.title} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4">
      {upcoming.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>Nothing coming up.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-2">{upcoming.map(row)}</div>
      )}
      {past.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {past.length} past event{past.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 grid gap-2 opacity-80">{past.map(row)}</div>
        </details>
      ) : null}
    </div>
  );
}
