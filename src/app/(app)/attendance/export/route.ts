import { getAuth } from "@/lib/auth";
import { isLeadership } from "@/lib/roles";
import { attendanceSummaryCsv, slugify } from "@/lib/attendance";
import { csvResponse, getAttendanceGroups, getAttendanceSummary, pickAttendanceGroup } from "@/lib/attendance-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth || !isLeadership(auth.user.role)) return new Response("Unauthorized", { status: 401 });

  const requested = new URL(req.url).searchParams.get("group") ?? undefined;
  const groups = await getAttendanceGroups();
  const group = pickAttendanceGroup(groups, requested, null);
  const { rows } = await getAttendanceSummary(group);
  return csvResponse(attendanceSummaryCsv(rows), `attendance-summary-${slugify(group.name)}.csv`);
}
