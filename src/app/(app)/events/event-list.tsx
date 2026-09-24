import Link from "next/link";
import { MapPin, Clock, ClipboardCheck, Pencil, Users } from "lucide-react";
import type { Event } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { DeleteEventButton } from "./delete-event-button";
import { formatEventDate, formatEventTime, todayUtc } from "./event-dates";

// Band events carry their sent-email log (EventNotice rows) and their expected
// class lists; drum-major events are invited on creation and flag that with
// `notify` instead.
type ListedEvent = Event & { notices?: { id: string }[]; groups?: { group: { name: string } }[] };

// Upcoming first (soonest at the top), past events tucked into a disclosure.
export function EventList({
  events,
  emailedLabel,
  showAttendance = false,
}: {
  events: ListedEvent[];
  emailedLabel: string;
  // Band events get a roll-call link; drum-major events don't track attendance.
  showAttendance?: boolean;
}) {
  const today = todayUtc();
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.getTime() - a.date.getTime());

  const row = (e: ListedEvent) => (
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
            {e.groups?.length ? (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {e.groups.map((g) => g.group.name).join(" · ")}
              </span>
            ) : null}
          </p>
          {e.description ? <p className="mt-1 text-sm text-muted-foreground">{e.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showAttendance && e.attendancePublishedAt ? (
            <Badge variant="secondary">Published</Badge>
          ) : showAttendance && e.attendanceTakenAt ? (
            <Badge variant="outline">In progress</Badge>
          ) : null}
          {showAttendance ? (
            <Link href={`/events/${e.id}/attendance`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ClipboardCheck /> Attendance
            </Link>
          ) : null}
          {showAttendance ? (
            <Link
              href={`/events/${e.id}/edit`}
              aria-label={`Edit ${e.title}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Pencil />
            </Link>
          ) : null}
          {e.notify || (e.notices?.length ?? 0) > 0 ? <Badge variant="outline">{emailedLabel}</Badge> : null}
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
