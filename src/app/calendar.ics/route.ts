import { prisma } from "@/lib/prisma";
import { EventAudience } from "@/generated/prisma/client";
import { buildCalendarFeed } from "@/lib/ics";
import { getBandName } from "@/lib/leadership";
import { appBaseUrl } from "@/lib/email";
import { eventLocalDate, todayUtc } from "@/app/(app)/events/event-dates";

// Subscribable feed of band events (last 30 days onward). Public by design:
// it's the same list as /calendar.
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const since = new Date(todayUtc().getTime() - 30 * DAY_MS);
  const [events, bandName] = await Promise.all([
    prisma.event.findMany({ where: { audience: EventAudience.BAND, date: { gte: since } }, orderBy: { date: "asc" } }),
    getBandName(),
  ]);
  const ics = buildCalendarFeed(
    events.map((e) => ({
      uid: `${e.id}@drummajor-portal`,
      title: e.title,
      description: e.description,
      location: e.location,
      date: eventLocalDate(e.date),
      time: e.time,
      url: `${appBaseUrl()}/calendar`,
    })),
    { name: bandName ? `${bandName} events` : "Band events" },
  );
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="band-events.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
