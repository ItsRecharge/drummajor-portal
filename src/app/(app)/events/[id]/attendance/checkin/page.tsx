import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { loadSheetSnapshot } from "@/lib/attendance-data";
import { loadCheckInSession } from "@/lib/checkin-data";
import { appBaseUrl } from "@/lib/email";
import { todayUtcInZone } from "@/lib/event-schedule";
import { Role, EventAudience } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventWhen } from "@/app/(app)/events/event-dates";
import { CheckInDisplay } from "./checkin-display";

export const metadata = { title: "QR check-in — Drum Major Portal" };

// The drum major's side of QR self check-in: open it (which captures their
// phone as the geofence anchor), show the rotating code, watch names arrive.
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event || event.audience !== EventAudience.BAND) notFound();
  const [settings, session, snapshot] = await Promise.all([
    getAppSettings(),
    loadCheckInSession(id),
    loadSheetSnapshot(id),
  ]);
  if (!session || !snapshot) notFound();
  const isToday = event.date.getTime() === todayUtcInZone(new Date()).getTime();

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href={`/events/${id}/attendance`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Attendance sheet
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight uppercase">QR check-in (beta)</h1>
        <p className="text-sm text-muted-foreground">
          {event.title} · {formatEventWhen(event.date, event.time)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>

      {settings?.checkInEnabled ? (
        <CheckInDisplay
          eventId={id}
          initialSession={session}
          initialSnapshot={snapshot}
          isToday={isToday}
          published={event.attendancePublishedAt !== null}
          baseUrl={appBaseUrl()}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>QR check-in is turned off</CardTitle>
            <CardDescription>
              An admin can turn it on under <em>Settings → Attendance policy</em>. Until then, take attendance on the
              sheet.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      )}
    </div>
  );
}
