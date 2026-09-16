// Attendance is marked against roster contacts, one sheet per band event. This
// module is pure (no Prisma import) so it runs under node:test; the status
// strings mirror the AttendanceStatus Prisma enum.

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "EXCUSED", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  EXCUSED: "Excused",
  ABSENT: "Absent",
};

export function isAttendanceStatus(v: unknown): v is AttendanceStatus {
  return typeof v === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(v);
}

// Sheet form fields are `status:<contactId>`.
export const STATUS_FIELD_PREFIX = "status:";

export function statusFieldName(contactId: string): string {
  return `${STATUS_FIELD_PREFIX}${contactId}`;
}

// One entry per expected contact. Missing or unrecognised values mean ABSENT;
// fields for contacts outside the expected list are ignored.
export function parseAttendanceForm(
  formData: FormData,
  expectedContactIds: string[],
): Map<string, AttendanceStatus> {
  const out = new Map<string, AttendanceStatus>();
  for (const id of expectedContactIds) {
    const raw = formData.get(statusFieldName(id));
    out.set(id, isAttendanceStatus(raw) ? raw : "ABSENT");
  }
  return out;
}

export type StatusCounts = { present: number; late: number; excused: number; absent: number };

export function countStatuses(statuses: Iterable<AttendanceStatus>): StatusCounts {
  const c: StatusCounts = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const s of statuses) {
    if (s === "PRESENT") c.present++;
    else if (s === "LATE") c.late++;
    else if (s === "EXCUSED") c.excused++;
    else c.absent++;
  }
  return c;
}

export type AttendanceSummaryRow = StatusCounts & {
  contactId: string;
  expected: number;
  rate: number | null;
};

// Present and Late both count as attended; Excused is dropped from the
// denominator so an excused student isn't penalised. Null when nothing counts.
export function attendanceRate(c: StatusCounts & { expected: number }): number | null {
  const denom = c.expected - c.excused;
  return denom > 0 ? (c.present + c.late) / denom : null;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

// Per-contact totals. `contactIds` seeds rows so students with no records still
// appear (zeros, null rate).
export function summarizeAttendance(
  records: { contactId: string; status: AttendanceStatus }[],
  contactIds: string[] = [],
): Map<string, AttendanceSummaryRow> {
  const rows = new Map<string, AttendanceSummaryRow>();
  const blank = (contactId: string): AttendanceSummaryRow => ({
    contactId,
    expected: 0,
    present: 0,
    late: 0,
    excused: 0,
    absent: 0,
    rate: null,
  });
  for (const id of contactIds) rows.set(id, blank(id));
  for (const r of records) {
    const row = rows.get(r.contactId) ?? blank(r.contactId);
    row.expected++;
    if (r.status === "PRESENT") row.present++;
    else if (r.status === "LATE") row.late++;
    else if (r.status === "EXCUSED") row.excused++;
    else row.absent++;
    rows.set(r.contactId, row);
  }
  for (const row of rows.values()) row.rate = attendanceRate(row);
  return rows;
}
