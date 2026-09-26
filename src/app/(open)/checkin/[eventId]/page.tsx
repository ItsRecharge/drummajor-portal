import { EventAudience } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSessionState } from "@/lib/checkin-data";
import { CHECKIN_ERRORS, sessionOpen } from "@/lib/checkin-rules";
import { checkInSecret } from "@/lib/checkin-secret";
import { TICKET_TTL_MS, makeTicket, verifyToken } from "@/lib/checkin-token";
import { formatEventWhen } from "@/app/(app)/events/event-dates";
import { CheckInForm } from "./checkin-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check in" };

// Public page a scanned QR code opens. The `k` token must be from the current
// or previous 20-second window; a good scan earns a 5-minute ticket so typing
// a name doesn't race the code. The roster is never sent to the browser.
export default async function StudentCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}) {
  const { eventId } = await params;
  const { k } = await searchParams;
  const now = new Date();
  const loaded = await loadSessionState(eventId);
  const event = loaded && loaded.event.audience === EventAudience.BAND ? loaded.event : null;

  let problem: string | null = null;
  if (!loaded || !event) {
    problem = CHECKIN_ERRORS.NOT_BAND;
  } else {
    const open = sessionOpen(loaded.state, now);
    if (!open.ok) problem = open.error;
    else if (typeof k !== "string" || !verifyToken(checkInSecret(), eventId, k, now.getTime())) {
      problem = CHECKIN_ERRORS.BAD_TOKEN;
    }
  }
  const ticket = problem ? null : makeTicket(checkInSecret(), eventId, now.getTime() + TICKET_TTL_MS);

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Attendance</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight uppercase">Check in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Type your name exactly as it appears on Google Classroom and share your location. One check-in per phone.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{event ? event.title : "Link not valid"}</CardTitle>
          <CardDescription>
            {event
              ? `${formatEventWhen(event.date, event.time)}${event.location ? ` · ${event.location}` : ""}`
              : "This link doesn't match a band event. Scan the code on the drum major's screen."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ticket ? (
            <CheckInForm eventId={eventId} ticket={ticket} />
          ) : (
            <p className="text-sm text-destructive">{problem}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
