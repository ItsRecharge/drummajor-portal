import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { isLeadership } from "@/lib/roles";
import { EventAudience } from "@/generated/prisma/client";
import { eventAttendanceCsv, slugify, type AttendanceStatus } from "@/lib/attendance";
import { csvResponse } from "@/lib/attendance-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth || !isLeadership(auth.user.role)) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendance: { include: { contact: true }, orderBy: { contact: { name: "asc" } } } },
  });
  if (!event || event.audience !== EventAudience.BAND) return new Response("Not found", { status: 404 });

  const csv = eventAttendanceCsv(
    event.attendance.map((r) => ({
      name: r.contact.name,
      email: r.contact.email,
      instrument: r.contact.instrument ?? "",
      status: r.status as AttendanceStatus,
    })),
  );
  const day = event.date.toISOString().slice(0, 10);
  return csvResponse(csv, `attendance-${day}-${slugify(event.title)}.csv`);
}
