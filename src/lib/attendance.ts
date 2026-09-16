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
