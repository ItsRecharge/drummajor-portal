// Attendance is marked against roster contacts, one sheet per band event. This
// module is pure (no Prisma import) so it runs under node:test; the status
// strings mirror the AttendanceStatus Prisma enum.
import { csvCell } from "./music-index-csv.ts";

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

// What the roll-call sheet shows and streams. Serializable (ISO strings) so a
// snapshot can travel over Server-Sent Events and back from a server action.
export type SheetRow = {
  id: string;
  name: string;
  instrument: string;
  status: AttendanceStatus;
  emailedAt: string | null;
};

export type SheetSnapshot = {
  // Date.now() when loaded; clients ignore a snapshot older than the one shown.
  version: number;
  rows: SheetRow[];
  // Names of the expected class lists.
  groups: string[];
  // Last edit (any tap), and when a drum major published the sheet.
  takenAt: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  // yyyy-mm-dd, for the "not before the event" publish guard.
  eventDay: string;
};

type RosterContact = { id: string; name: string; instrument: string | null };
type SheetRecord = {
  contactId: string;
  status: AttendanceStatus;
  absenceEmailedAt: string | Date | null;
  contact: { name: string; instrument: string | null };
};

// The roster plus anyone who already has a record (they may have left the group
// since), alphabetical. No record yet = Absent.
export function buildSheetRows(roster: RosterContact[], records: SheetRecord[]): SheetRow[] {
  const byId = new Map(records.map((r) => [r.contactId, r]));
  const rows = new Map<string, SheetRow>();
  const add = (id: string, name: string, instrument: string | null) => {
    const r = byId.get(id);
    const emailed = r?.absenceEmailedAt ?? null;
    rows.set(id, {
      id,
      name,
      instrument: instrument ?? "",
      status: r?.status ?? "ABSENT",
      emailedAt: emailed instanceof Date ? emailed.toISOString() : emailed,
    });
  };
  for (const c of roster) add(c.id, c.name, c.instrument);
  for (const r of records) if (!rows.has(r.contactId)) add(r.contactId, r.contact.name, r.contact.instrument);
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Optimistic overrides for taps still in flight. Untouched rows keep identity.
export function applyPending(rows: SheetRow[], pending: ReadonlyMap<string, AttendanceStatus>): SheetRow[] {
  if (pending.size === 0) return rows;
  return rows.map((r) => {
    const s = pending.get(r.id);
    return s && s !== r.status ? { ...r, status: s } : r;
  });
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

// RFC 4180, CRLF endings — same rules as index.csv.
function csvText(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map((v) => csvCell(String(v))).join(",")).join("\r\n") + "\r\n";
}

export type EventCsvRow = { name: string; email: string; instrument: string; status: AttendanceStatus };

export function eventAttendanceCsv(rows: EventCsvRow[]): string {
  return csvText(
    ["Name", "Email", "Instrument", "Status"],
    rows.map((r) => [r.name, r.email, r.instrument, ATTENDANCE_LABELS[r.status]]),
  );
}

export type SummaryCsvRow = AttendanceSummaryRow & { name: string; email: string; instrument: string };

export function attendanceSummaryCsv(rows: SummaryCsvRow[]): string {
  return csvText(
    ["Name", "Email", "Instrument", "Expected", "Present", "Late", "Excused", "Absent", "Rate"],
    rows.map((r) => [
      r.name,
      r.email,
      r.instrument,
      r.expected,
      r.present,
      r.late,
      r.excused,
      r.absent,
      r.rate === null ? "" : formatRate(r.rate),
    ]),
  );
}

// File-name-safe slug for CSV downloads.
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "event";
}
