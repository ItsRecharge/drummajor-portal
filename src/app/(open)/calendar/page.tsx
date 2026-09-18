import { CalendarPlus, Clock, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EventAudience } from "@/generated/prisma/client";
import { getBandName } from "@/lib/leadership";
import { appBaseUrl } from "@/lib/email";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { formatEventDate, formatEventTime, todayUtc } from "@/app/(app)/events/event-dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Band Calendar" };

// Public list of upcoming band events, grouped by month. Linked from every
// event email; anyone can subscribe to the .ics feed.
export default async function CalendarPage() {
  const [events, bandName] = await Promise.all([
    prisma.event.findMany({
      where: { audience: EventAudience.BAND, date: { gte: todayUtc() } },
      orderBy: { date: "asc" },
    }),
    getBandName(),
  ]);

  const months = new Map<string, typeof events>();
  for (const e of events) {
    const key = formatEventDate(e.date, { month: "long", year: "numeric", day: undefined });
    const list = months.get(key) ?? [];
    list.push(e);
    months.set(key, list);
  }
  const feedUrl = `${appBaseUrl()}/calendar.ics`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{bandName ?? "Band"}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight uppercase">Band calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every rehearsal, performance and competition. Attendance is mandatory; conflicts must be cleared
            at least three days ahead.
          </p>
        </div>
        <a href="/calendar.ics" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <CalendarPlus data-icon="inline-start" /> Subscribe (.ics)
        </a>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>Nothing scheduled yet. Check back soon.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        [...months.entries()].map(([label, list]) => (
          <section key={label} className="grid gap-2">
            <h2 className="eyebrow">{label}</h2>
            {list.map((e) => (
              <Card key={e.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="grid w-14 shrink-0 place-items-center rounded-md border bg-muted/40 py-1.5 leading-none">
                    <span className="font-mono text-[0.6rem] tracking-widest text-primary uppercase">
                      {formatEventDate(e.date, { month: "short", day: undefined })}
                    </span>
                    <span className="stat-numeral !text-2xl">{formatEventDate(e.date, { month: undefined, day: "numeric" })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.title}</p>
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
                    {e.description ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{e.description}</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        To follow this calendar in Google Calendar: <em>Other calendars → + → From URL</em> and paste{" "}
        <code className="rounded bg-muted px-1 py-0.5">{feedUrl}</code>. Apple Calendar: <em>File → New Calendar
        Subscription</em>.
      </p>
    </div>
  );
}
