import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/client";
import { getAttendanceGroups, getAttendanceSummary, pickAttendanceGroup } from "@/lib/attendance-data";
import { formatRate } from "@/lib/attendance";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GroupPicker } from "@/components/group-picker";

export const metadata = { title: "Attendance — Drum Major Portal" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const { group: requestedGroupId } = await searchParams;
  const groups = await getAttendanceGroups();
  const group = pickAttendanceGroup(groups, requestedGroupId, null);
  const { rows, eventsTaken } = await getAttendanceSummary(group);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Season totals per student. Take attendance from each band event&apos;s page.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{group.name}</CardTitle>
            <CardDescription>
              {eventsTaken === 0
                ? "No attendance taken yet."
                : `${eventsTaken} event${eventsTaken === 1 ? "" : "s"} taken. Rate = present + late, out of expected minus excused.`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GroupPicker groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group.id} />
            <a
              href={`/attendance/export?group=${encodeURIComponent(group.id)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download /> CSV
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody in this class list yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Present</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Excused</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.instrument}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.expected}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.excused}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatRate(r.rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
