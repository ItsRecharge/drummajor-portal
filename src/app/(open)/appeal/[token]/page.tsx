import { prisma } from "@/lib/prisma";
import { AppealStatus } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTENDANCE_LABELS, type AttendanceStatus as Status } from "@/lib/attendance";
import { getConflictPolicy } from "@/lib/attendance-policy";
import { formatEventWhen } from "@/app/(app)/events/event-dates";
import { AppealForm } from "./appeal-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appeal an absence" };

// Public page behind the personal token from an absence email. Shows the
// absence, then either the appeal form or where the appeal stands.
export default async function AppealPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await prisma.attendanceRecord.findUnique({
    where: { appealToken: token },
    include: { contact: true, event: true, appeal: true },
  });

  if (!record) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link not valid</CardTitle>
          <CardDescription>
            This appeal link doesn&apos;t match any absence. Use the link from your absence email, or talk to a drum
            major.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const when = formatEventWhen(record.event.date, record.event.time);
  const policy = await getConflictPolicy();
  const status = record.status as Status;

  let body: React.ReactNode;
  if (status !== "ABSENT") {
    body = (
      <p className="text-sm text-success">
        This absence has already been cleared — it&apos;s recorded as <strong>{ATTENDANCE_LABELS[status]}</strong>.
      </p>
    );
  } else if (record.appeal?.status === AppealStatus.PENDING) {
    body = <p className="text-sm">Your appeal is waiting for a drum major to review it. You&apos;ll get an email either way.</p>;
  } else if (record.appeal?.status === AppealStatus.DENIED) {
    body = (
      <p className="text-sm">
        Your appeal was not approved, so this stays recorded as absent. If you think that&apos;s wrong, talk to{" "}
        <strong>{policy.contactName}</strong> directly.
      </p>
    );
  } else {
    body = <AppealForm token={token} />;
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow">Attendance</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight uppercase">Appeal an absence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance is mandatory and may impact your grade. Conflicts must be cleared with {policy.contactName}
          {policy.ccName ? ` (CC ${policy.ccName})` : ""} at least three days ahead; this form is for absences that
          were excused or recorded incorrectly.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{record.event.title}</CardTitle>
          <CardDescription>
            {when}
            {record.event.location ? ` · ${record.event.location}` : ""} · {record.contact.name}
          </CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
