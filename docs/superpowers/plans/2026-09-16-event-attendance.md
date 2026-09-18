# Event Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leadership can mark Present / Late / Excused / Absent for every roster contact at a band event, and see per-student totals across the season, with CSV export.

**Architecture:** One new table `AttendanceRecord` keyed (eventId, contactId) plus two nullable columns on `Event`. A pure module `src/lib/attendance.ts` (no Prisma import, unit-tested under node:test) does parsing, counting, summary math and CSV. A thin Prisma helper `src/lib/attendance-data.ts` resolves groups/contacts. Two screens: the per-event sheet at `/events/[id]/attendance` and the season summary at `/attendance`, each with a CSV route handler.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Prisma 7 (driver adapters; PGlite in dev), Tailwind 4 + shadcn/base-ui components, node:test with Node 22 type stripping (tests import `.ts` with relative paths; no `enum` keyword, no `@/` alias in pure modules).

Spec: `docs/superpowers/specs/2026-09-16-event-attendance-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `AttendanceStatus` enum, `AttendanceRecord` model, `Event.attendanceGroupId/attendanceTakenAt`, back-relations |
| `prisma/migrations/7_attendance/migration.sql` | Hand-written SQL matching the schema (same style as migration 6) |
| `src/lib/attendance.ts` | Pure: statuses, labels, form parsing, counts, summary math, CSV, slug |
| `tests/attendance.test.ts` | node:test coverage of the pure module |
| `src/lib/attendance-data.ts` | Prisma: built-in groups for the picker, group → contacts, summary rows, CSV `Response` |
| `src/components/group-picker.tsx` | Client `<select>` that navigates with `?group=` |
| `src/app/(app)/events/[id]/attendance/page.tsx` | Sheet page (server) |
| `src/app/(app)/events/[id]/attendance/attendance-sheet.tsx` | Sheet UI (client): toggles, filter, counts, save |
| `src/app/(app)/events/[id]/attendance/actions.ts` | `saveAttendanceAction` |
| `src/app/(app)/events/[id]/attendance/export/route.ts` | Per-event CSV |
| `src/app/(app)/attendance/page.tsx` | Season summary page |
| `src/app/(app)/attendance/export/route.ts` | Summary CSV |
| `src/app/(app)/events/event-list.tsx` | Attendance link + Taken badge on band rows |
| `src/app/(app)/events/page.tsx` | Pass `showAttendance` |
| `src/components/app-sidebar.tsx` | Sidebar item |
| `src/app/(app)/guide/page.tsx` | Guide section |
| `docs/plan.md` | Status log entry |

---

### Task 1: Pure module — statuses and form parsing (TDD)

**Files:**
- Create: `tests/attendance.test.ts`
- Create: `src/lib/attendance.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/attendance.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABELS,
  isAttendanceStatus,
  parseAttendanceForm,
} from "../src/lib/attendance.ts";

test("statuses: four values in UI order with labels", () => {
  assert.deepEqual(ATTENDANCE_STATUSES, ["PRESENT", "LATE", "EXCUSED", "ABSENT"]);
  assert.equal(ATTENDANCE_LABELS.EXCUSED, "Excused");
  assert.ok(isAttendanceStatus("LATE"));
  assert.ok(!isAttendanceStatus("late"));
  assert.ok(!isAttendanceStatus(null));
});

test("parseAttendanceForm: reads status:<id>, defaults missing/invalid to ABSENT, ignores strangers", () => {
  const fd = new FormData();
  fd.set("status:a", "PRESENT");
  fd.set("status:b", "LATE");
  fd.set("status:c", "bogus");
  fd.set("status:z", "PRESENT"); // not expected → dropped
  const m = parseAttendanceForm(fd, ["a", "b", "c", "d"]);
  assert.deepEqual(
    [...m],
    [
      ["a", "PRESENT"],
      ["b", "LATE"],
      ["c", "ABSENT"],
      ["d", "ABSENT"],
    ],
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/attendance.test.ts`
Expected: FAIL — `Cannot find module '.../src/lib/attendance.ts'`

- [ ] **Step 3: Minimal implementation**

```ts
// src/lib/attendance.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/attendance.test.ts`
Expected: `# pass 2`

- [ ] **Step 5: Commit**

```bash
git add tests/attendance.test.ts src/lib/attendance.ts
git commit -m "feat: attendance statuses and sheet form parsing (pure module)"
```

---

### Task 2: Pure module — counts, summary math, rate formatting (TDD)

**Files:**
- Modify: `tests/attendance.test.ts`
- Modify: `src/lib/attendance.ts`

- [ ] **Step 1: Append failing tests**

```ts
// append to tests/attendance.test.ts; extend the import line with:
//   countStatuses, summarizeAttendance, attendanceRate, formatRate,

test("countStatuses tallies each status", () => {
  assert.deepEqual(countStatuses(["PRESENT", "PRESENT", "LATE", "EXCUSED", "ABSENT"]), {
    present: 2,
    late: 1,
    excused: 1,
    absent: 1,
  });
});

test("summarizeAttendance: late counts as attended, excused leaves the denominator", () => {
  const rows = summarizeAttendance([
    { contactId: "a", status: "PRESENT" },
    { contactId: "a", status: "LATE" },
    { contactId: "a", status: "EXCUSED" },
    { contactId: "a", status: "ABSENT" },
  ]);
  const a = rows.get("a")!;
  assert.deepEqual(a, { contactId: "a", expected: 4, present: 1, late: 1, excused: 1, absent: 1, rate: 2 / 3 });
});

test("summarizeAttendance: listed contacts with no records get zeros and a null rate", () => {
  const rows = summarizeAttendance([], ["a"]);
  assert.deepEqual(rows.get("a"), { contactId: "a", expected: 0, present: 0, late: 0, excused: 0, absent: 0, rate: null });
});

test("summarizeAttendance: all excused → null rate", () => {
  const rows = summarizeAttendance([{ contactId: "a", status: "EXCUSED" }]);
  assert.equal(rows.get("a")!.rate, null);
});

test("attendanceRate and formatRate", () => {
  assert.equal(attendanceRate({ expected: 10, present: 8, late: 1, excused: 0, absent: 1 }), 0.9);
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(0.916), "92%");
  assert.equal(formatRate(1), "100%");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/attendance.test.ts`
Expected: FAIL — `countStatuses is not a function` (or SyntaxError on the named import)

- [ ] **Step 3: Implement**

```ts
// append to src/lib/attendance.ts

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/attendance.test.ts`
Expected: `# pass 7`

- [ ] **Step 5: Commit**

```bash
git add tests/attendance.test.ts src/lib/attendance.ts
git commit -m "feat: attendance counts and season summary math"
```

---

### Task 3: Pure module — CSV output and file slug (TDD)

**Files:**
- Modify: `tests/attendance.test.ts`
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/music-index-csv.ts` (export `csvCell`)

- [ ] **Step 1: Append failing tests**

```ts
// append to tests/attendance.test.ts; extend the import with:
//   eventAttendanceCsv, attendanceSummaryCsv, slugify,

test("eventAttendanceCsv: header + label column, quotes commas and doubles quotes", () => {
  const csv = eventAttendanceCsv([
    { name: 'Smith, "Jo"', email: "jo@wpsstudent.com", instrument: "Flute", status: "LATE" },
    { name: "Ann Lee", email: "ann@wpsstudent.com", instrument: "", status: "ABSENT" },
  ]);
  assert.equal(
    csv,
    'Name,Email,Instrument,Status\r\n"Smith, ""Jo""",jo@wpsstudent.com,Flute,Late\r\nAnn Lee,ann@wpsstudent.com,,Absent\r\n',
  );
});

test("attendanceSummaryCsv: counts and a percent (blank when null)", () => {
  const csv = attendanceSummaryCsv([
    { contactId: "a", name: "Ann", email: "a@x", instrument: "Tuba", expected: 4, present: 3, late: 0, excused: 1, absent: 0, rate: 1 },
    { contactId: "b", name: "Bo", email: "b@x", instrument: "", expected: 0, present: 0, late: 0, excused: 0, absent: 0, rate: null },
  ]);
  assert.equal(
    csv,
    "Name,Email,Instrument,Expected,Present,Late,Excused,Absent,Rate\r\nAnn,a@x,Tuba,4,3,0,1,0,100%\r\nBo,b@x,,0,0,0,0,0,\r\n",
  );
});

test("slugify: lowercase, dashes, no punctuation, trimmed", () => {
  assert.equal(slugify("Fall Rehearsal #2 — Stadium!"), "fall-rehearsal-2-stadium");
  assert.equal(slugify("   "), "event");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/attendance.test.ts`
Expected: FAIL on the new named imports

- [ ] **Step 3: Export `csvCell` from `src/lib/music-index-csv.ts`**

Change `function csvCell(value: string): string {` to `export function csvCell(value: string): string {`.

- [ ] **Step 4: Implement in `src/lib/attendance.ts`**

```ts
// prepend import at top of src/lib/attendance.ts
import { csvCell } from "./music-index-csv.ts";

// append:

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
```

Note: `music-index-csv.ts` must import nothing that breaks under plain Node. Check its imports first (`head -5 src/lib/music-index-csv.ts`); it imports only from `./music-naming.ts`-style relative paths or nothing. If it uses an `@/` alias, instead copy the one-line `csvCell` into `attendance.ts` and leave `music-index-csv.ts` alone.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: all suites pass, `tests/attendance.test.ts` `# pass 10`

- [ ] **Step 6: Commit**

```bash
git add tests/attendance.test.ts src/lib/attendance.ts src/lib/music-index-csv.ts
git commit -m "feat: attendance CSV builders and download slug"
```

---

### Task 4: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/7_attendance/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add to `model Contact` (after `groups     ContactGroup[]`):
```prisma
  attendance AttendanceRecord[]
```

Add to `model Group` (after `announcementLinks AnnouncementRecipientGroup[]`):
```prisma
  attendanceEvents  Event[]
```

Replace `model Event` with:
```prisma
model Event {
  id          String        @id @default(cuid())
  title       String
  description String?
  location    String?
  date        DateTime
  time        String?
  audience    EventAudience @default(BAND)
  notify      Boolean       @default(false)
  createdById String?
  createdBy   User?         @relation("EventCreator", fields: [createdById], references: [id], onDelete: SetNull)
  // Attendance: which class list was expected and when the sheet was last saved.
  attendanceGroupId String?
  attendanceGroup   Group?     @relation(fields: [attendanceGroupId], references: [id], onDelete: SetNull)
  attendanceTakenAt DateTime?
  attendance        AttendanceRecord[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([audience, date])
}

// One row per expected student per band event. "Expected" = had a row when the
// sheet was saved, so summaries divide by rows, not by current group size.
enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

model AttendanceRecord {
  eventId   String
  event     Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  contactId String
  contact   Contact          @relation(fields: [contactId], references: [id], onDelete: Cascade)
  status    AttendanceStatus
  updatedAt DateTime         @updatedAt

  @@id([eventId, contactId])
  @@index([contactId])
}
```

- [ ] **Step 2: Write `prisma/migrations/7_attendance/migration.sql`**

```sql
-- Attendance: per-student status for band events, plus which class list was
-- expected and when the sheet was last saved.
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "AttendanceRecord" (
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("eventId", "contactId")
);

CREATE INDEX "AttendanceRecord_contactId_idx" ON "AttendanceRecord"("contactId");

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD COLUMN "attendanceGroupId" TEXT;
ALTER TABLE "Event" ADD COLUMN "attendanceTakenAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD CONSTRAINT "Event_attendanceGroupId_fkey"
  FOREIGN KEY ("attendanceGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify migration matches schema**

Run:
```bash
npx prisma generate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:dmp@localhost:5434/dmp" --script
```
If no local Postgres is running, start one first (`docker run -d --name dmp-test-pg -e POSTGRES_PASSWORD=dmp -e POSTGRES_DB=dmp -p 5434:5432 postgres:16`). Expected output: `-- This is an empty migration.` If docker is unavailable, skip this check and rely on `npm run dev` applying the SQL to PGlite (Task 10) plus `npx tsc --noEmit` compiling against the generated client.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/7_attendance/migration.sql
git commit -m "feat: AttendanceRecord table and event attendance columns"
```

---

### Task 5: Prisma helpers `src/lib/attendance-data.ts`

**Files:**
- Create: `src/lib/attendance-data.ts`

- [ ] **Step 1: Write the module**

```ts
// src/lib/attendance-data.ts
// Prisma-facing helpers for attendance. Pure logic lives in ./attendance.ts.
import { prisma } from "@/lib/prisma";
import { BUILTIN_GROUPS, ensureBuiltInGroups, EVERYONE, isEveryone } from "@/lib/groups";
import { summarizeAttendance, type AttendanceStatus, type SummaryCsvRow } from "@/lib/attendance";
import type { Contact, Group } from "@/generated/prisma/client";

export type PickerGroup = { id: string; name: string };

// The three built-in class lists, in the order the picker shows them.
export async function getAttendanceGroups(): Promise<Group[]> {
  await ensureBuiltInGroups();
  const groups = await prisma.group.findMany({ where: { builtIn: true } });
  const order = new Map<string, number>(BUILTIN_GROUPS.map((n, i) => [n, i]));
  return groups.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

// `?group=` wins, then the event's saved group, then Everyone.
export function pickAttendanceGroup(
  groups: Group[],
  requestedId: string | undefined,
  savedId: string | null | undefined,
): Group {
  return (
    groups.find((g) => g.id === requestedId) ??
    groups.find((g) => g.id === savedId) ??
    groups.find((g) => g.name === EVERYONE) ??
    groups[0]
  );
}

// Contacts in a group, alphabetical. Everyone = the whole roster.
export function getGroupContacts(group: Group): Promise<Contact[]> {
  return prisma.contact.findMany({
    where: isEveryone(group) ? {} : { groups: { some: { groupId: group.id } } },
    orderBy: { name: "asc" },
  });
}

export type SummaryTableRow = SummaryCsvRow & { id: string };

// Season totals for every contact in the group, plus how many events have a
// saved sheet (for the "N events taken" line).
export async function getAttendanceSummary(
  group: Group,
): Promise<{ rows: SummaryTableRow[]; eventsTaken: number }> {
  const contacts = await getGroupContacts(group);
  const ids = contacts.map((c) => c.id);
  const [records, eventsTaken] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { contactId: { in: ids } },
      select: { contactId: true, status: true },
    }),
    prisma.event.count({ where: { attendanceTakenAt: { not: null } } }),
  ]);
  const summary = summarizeAttendance(
    records.map((r) => ({ contactId: r.contactId, status: r.status as AttendanceStatus })),
    ids,
  );
  const rows = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    instrument: c.instrument ?? "",
    ...summary.get(c.id)!,
  }));
  return { rows, eventsTaken };
}

export function csvResponse(text: string, filename: string): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^$" | head -20`
Expected: no errors mentioning `attendance-data.ts` (pre-existing `.next/types` noise is fine).

- [ ] **Step 3: Commit**

```bash
git add src/lib/attendance-data.ts
git commit -m "feat: attendance data helpers (groups, contacts, season summary)"
```

---

### Task 6: Group picker component + save action

**Files:**
- Create: `src/components/group-picker.tsx`
- Create: `src/app/(app)/events/[id]/attendance/actions.ts`

- [ ] **Step 1: Write `src/components/group-picker.tsx`**

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";

// Class-list picker for attendance screens. Navigates with ?group=<id> so the
// server re-renders the list; no local state.
export function GroupPicker({
  groups,
  value,
  label = "Class list",
}: {
  groups: { id: string; name: string }[];
  value: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => router.replace(`${pathname}?group=${encodeURIComponent(e.target.value)}`)}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/events/[id]/attendance/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/form";
import { countStatuses, parseAttendanceForm } from "@/lib/attendance";
import { getGroupContacts } from "@/lib/attendance-data";
import { Role, EventAudience } from "@/generated/prisma/client";

// Replaces the whole sheet: one row per contact in the chosen group, so
// switching groups drops rows for students no longer expected.
export async function saveAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor } = await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const eventId = String(formData.get("eventId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");

  const [event, group] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.group.findUnique({ where: { id: groupId } }),
  ]);
  if (!event || event.audience !== EventAudience.BAND) return { error: "Event not found." };
  if (!group || !group.builtIn) return { error: "Pick a class list." };

  const contacts = await getGroupContacts(group);
  const statuses = parseAttendanceForm(formData, contacts.map((c) => c.id));
  const counts = countStatuses(statuses.values());

  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany({ where: { eventId } }),
    prisma.attendanceRecord.createMany({
      data: [...statuses].map(([contactId, status]) => ({ eventId, contactId, status })),
    }),
    prisma.event.update({
      where: { id: eventId },
      data: { attendanceGroupId: group.id, attendanceTakenAt: new Date() },
    }),
  ]);
  await logAudit({
    actorId: actor.id,
    action: "ATTENDANCE_SAVED",
    target: event.title,
    metadata: { group: group.name, ...counts },
  });

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath("/attendance");
  return {
    success: true,
    message: `Saved — ${counts.present} present, ${counts.late} late, ${counts.excused} excused, ${counts.absent} absent.`,
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "attendance\|group-picker"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/group-picker.tsx "src/app/(app)/events/[id]/attendance/actions.ts"
git commit -m "feat: save attendance action and class-list picker"
```

---

### Task 7: Sheet page + client sheet + per-event CSV route

**Files:**
- Create: `src/app/(app)/events/[id]/attendance/page.tsx`
- Create: `src/app/(app)/events/[id]/attendance/attendance-sheet.tsx`
- Create: `src/app/(app)/events/[id]/attendance/export/route.ts`

- [ ] **Step 1: Write `attendance-sheet.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { emptyState } from "@/lib/form";
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  countStatuses,
  statusFieldName,
  type AttendanceStatus,
} from "@/lib/attendance";
import { saveAttendanceAction } from "./actions";

export type SheetRow = { id: string; name: string; instrument: string; status: AttendanceStatus };

// Selected-state colours per status; unselected buttons share a quiet outline.
const SELECTED: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-success-foreground border-success",
  LATE: "bg-amber-500 text-black border-amber-500 dark:bg-amber-400",
  EXCUSED: "bg-secondary text-secondary-foreground border-secondary",
  ABSENT: "bg-destructive text-white border-destructive",
};

export function AttendanceSheet({
  eventId,
  groupId,
  rows,
}: {
  eventId: string;
  groupId: string;
  rows: SheetRow[];
}) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.status])),
  );
  const [filter, setFilter] = useState("");
  const [state, formAction] = useActionState(saveAttendanceAction, emptyState);

  useEffect(() => {
    if (state.success) toast.success(state.message ?? "Saved.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const counts = useMemo(() => countStatuses(Object.values(statuses)), [statuses]);
  const q = filter.trim().toLowerCase();
  const visible = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.instrument.toLowerCase().includes(q))
    : rows;

  const setAll = (status: AttendanceStatus) =>
    setStatuses(Object.fromEntries(rows.map((r) => [r.id, status])));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody is in this class list yet. Import the roster from Google Classroom first.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="groupId" value={groupId} />
      {/* Every row is submitted even when filtered out of view. */}
      {rows.map((r) => (
        <input key={r.id} type="hidden" name={statusFieldName(r.id)} value={statuses[r.id] ?? "ABSENT"} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Find a student"
            placeholder="Find a student…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAll("PRESENT")}>
            Mark all present
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll("ABSENT")}>
            Mark all absent
          </Button>
          <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
        </div>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span><strong className="text-foreground">{counts.present}</strong> present</span>
        <span><strong className="text-foreground">{counts.late}</strong> late</span>
        <span><strong className="text-foreground">{counts.excused}</strong> excused</span>
        <span><strong className="text-foreground">{counts.absent}</strong> absent</span>
        <span className="ml-auto">{rows.length} expected</span>
      </p>

      <ul className="divide-y rounded-lg border">
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">No one matches “{filter}”.</li>
        ) : null}
        {visible.map((r) => {
          const current = statuses[r.id] ?? "ABSENT";
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                {r.instrument ? <p className="truncate text-xs text-muted-foreground">{r.instrument}</p> : null}
              </div>
              <div role="radiogroup" aria-label={`${r.name} status`} className="flex overflow-hidden rounded-md border">
                {ATTENDANCE_STATUSES.map((s) => {
                  const on = s === current;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStatuses((prev) => ({ ...prev, [r.id]: s }))}
                      className={cn(
                        "h-8 border-r px-2.5 text-xs font-medium transition-colors last:border-r-0",
                        on ? SELECTED[s] : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {ATTENDANCE_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save attendance</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write `page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Role, EventAudience } from "@/generated/prisma/client";
import { getAttendanceGroups, getGroupContacts, pickAttendanceGroup } from "@/lib/attendance-data";
import type { AttendanceStatus } from "@/lib/attendance";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupPicker } from "@/components/group-picker";
import { formatEventWhen } from "../../event-dates";
import { AttendanceSheet, type SheetRow } from "./attendance-sheet";

export const metadata = { title: "Attendance — Drum Major Portal" };

export default async function EventAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  await requireRole(Role.ADMIN, Role.DRUM_MAJOR);
  const [{ id }, { group: requestedGroupId }] = await Promise.all([params, searchParams]);

  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendance: { select: { contactId: true, status: true } } },
  });
  if (!event || event.audience !== EventAudience.BAND) notFound();

  const groups = await getAttendanceGroups();
  const group = pickAttendanceGroup(groups, requestedGroupId, event.attendanceGroupId);
  const contacts = await getGroupContacts(group);
  const saved = new Map(event.attendance.map((r) => [r.contactId, r.status as AttendanceStatus]));
  // Fresh sheet: everyone starts Absent; tap the students who are here.
  const rows: SheetRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    instrument: c.instrument ?? "",
    status: saved.get(c.id) ?? "ABSENT",
  }));

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Band events
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight uppercase">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          {event.title} · {formatEventWhen(event.date, event.time)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Roll call</CardTitle>
            <CardDescription>
              {event.attendanceTakenAt
                ? `Last saved ${event.attendanceTakenAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`
                : "Not taken yet. Everyone starts as absent."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GroupPicker groups={groups.map((g) => ({ id: g.id, name: g.name }))} value={group.id} />
            {event.attendanceTakenAt ? (
              <a href={`/events/${event.id}/attendance/export`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download /> CSV
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceSheet key={`${group.id}:${event.attendanceTakenAt?.getTime() ?? 0}`} eventId={event.id} groupId={group.id} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
```

The `key` on `AttendanceSheet` resets client state when the group changes or a save lands, so the sheet always reflects what the server has.

- [ ] **Step 3: Write `export/route.ts`**

```ts
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
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "attendance"; npx eslint "src/app/(app)/events/[id]" src/lib/attendance*.ts src/components/group-picker.tsx`
Expected: no output from tsc grep; eslint clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/events/[id]/attendance"
git commit -m "feat: per-event attendance sheet with CSV export"
```

---

### Task 8: Season summary page + CSV route + sidebar

**Files:**
- Create: `src/app/(app)/attendance/page.tsx`
- Create: `src/app/(app)/attendance/export/route.ts`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Write `src/app/(app)/attendance/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Write `src/app/(app)/attendance/export/route.ts`**

```ts
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
```

- [ ] **Step 3: Sidebar item in `src/components/app-sidebar.tsx`**

Add `ClipboardCheck` to the lucide import list, and in the `Band` section after the Band Events item:
```tsx
        { href: "/attendance", label: "Attendance", icon: ClipboardCheck, show: canInvite },
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "attendance\|sidebar"; npx eslint "src/app/(app)/attendance" src/components/app-sidebar.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/attendance" src/components/app-sidebar.tsx
git commit -m "feat: season attendance summary page with CSV and sidebar link"
```

---

### Task 9: Event list link + Taken badge, guide section, status log

**Files:**
- Modify: `src/app/(app)/events/event-list.tsx`
- Modify: `src/app/(app)/events/page.tsx`
- Modify: `src/app/(app)/guide/page.tsx`
- Modify: `docs/plan.md`

- [ ] **Step 1: `event-list.tsx`**

Imports: add `Link from "next/link"`, `ClipboardCheck` to the lucide import, and `buttonVariants` from `@/components/ui/button`.

Props: add `showAttendance?: boolean` to the destructured props and type.

In the row's right-hand `div` (the one with the `notify` badge and delete button), before the `{e.notify ? … }` line:
```tsx
          {showAttendance && e.attendanceTakenAt ? <Badge variant="secondary">Taken</Badge> : null}
          {showAttendance ? (
            <Link href={`/events/${e.id}/attendance`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ClipboardCheck /> Attendance
            </Link>
          ) : null}
```

- [ ] **Step 2: `events/page.tsx`**

Change `<EventList events={events} emailedLabel="Emailed" />` to
`<EventList events={events} emailedLabel="Emailed" showAttendance />`.

- [ ] **Step 3: Guide section in `guide/page.tsx`**

Add to `TOC` after the `#announce` entry:
```ts
  ["#attendance", "Taking attendance"],
```
Renumber later titles: `#music` becomes "7. Adding music", `#handoff` becomes "8. Handoff notes". Insert this `Section` after the `announce` section:
```tsx
      <Section id="attendance" title="6. Taking attendance">
        <ol>
          <li>
            Create the rehearsal or performance under <em>Band Events</em> (it only needs a title and
            date), then click <strong>Attendance</strong> on its row.
          </li>
          <li>
            Pick the class list at the top (Jazz Band, Concert/Marching Band, or Everyone). Everyone
            starts as <strong>Absent</strong> — tap <strong>Present</strong>, <strong>Late</strong> or{" "}
            <strong>Excused</strong> as you call names, or use <em>Mark all present</em> and fix the
            exceptions. The search box jumps to a name.
          </li>
          <li>
            <strong>Save attendance</strong>. You can come back and change it any time; the event row
            shows a <em>Taken</em> badge.
          </li>
          <li>
            <em>Attendance</em> in the sidebar shows season totals per student (present, late,
            excused, absent, and a rate that ignores excused absences). Both screens have a{" "}
            <strong>CSV</strong> button for the director.
          </li>
        </ol>
      </Section>
```

- [ ] **Step 4: `docs/plan.md`**

Append before the "Dev notes:" paragraph:
```md
Attendance (2026-09-16, `feat/attendance`, spec `docs/superpowers/specs/2026-09-16-event-attendance-design.md`):
band events get a per-event roll-call sheet (`/events/[id]/attendance`, Present/Late/Excused/Absent
against a chosen class list, CSV export) and a season summary at `/attendance` (per-student counts,
rate = present+late over expected−excused, CSV). New table `AttendanceRecord`; `Event` gains
`attendanceGroupId` / `attendanceTakenAt` (migration `7_attendance`).
```

- [ ] **Step 5: Type-check, lint, tests**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v ".next/" | head; npx eslint src; npm test`
Expected: tsc no project errors; eslint clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/events" "src/app/(app)/guide/page.tsx" docs/plan.md
git commit -m "feat: attendance link on band events, guide section, status log"
```

---

### Task 10: End-to-end verification on PGlite

**Files:** none (scratchpad Playwright script only)

- [ ] **Step 1: Start dev server**

Run (background): `DATABASE_URL="" PORT=3005 npm run dev`
Expected log: `[dev-db] Applied migration 7_attendance to PGlite (.pglite).` then `Ready`.

- [ ] **Step 2: Drive the flow with Playwright** (venv: `~/Downloads/music dump/.venv/bin/python`; login admin@winchesterps.org / Password123!)

Script outline (write to the scratchpad):
1. Log in; ensure the roster has contacts (if empty, add three via Roster → Add contact, one also in Jazz Band).
2. `/events`: create "Playwright Rehearsal" dated today. Row shows an **Attendance** button, no **Taken** badge.
3. Open the sheet: every row shows **Absent** selected; counts line reads `0 present … N absent`.
4. Click Present on two students, Late on one, Save. Toast `Saved — 2 present, 1 late, 0 excused, N-3 absent.` Reload: same selections; header says `Last saved …`.
5. Switch picker to Jazz Band: list shrinks to jazz members; save. Back on Everyone: previously-marked non-jazz students now show Absent (rows were replaced) — this is the documented behaviour.
6. `GET /events/<id>/attendance/export` → `text/csv`, header `Name,Email,Instrument,Status`, one row per jazz member.
7. `/attendance`: table rows for every contact; jazz students show Expected 1; `1 event taken`. CSV button → `attendance-summary-everyone.csv`.
8. `/events`: row now has **Taken** badge. `/dm-events`: no attendance controls.
9. Delete the event → `/attendance` shows Expected 0 for everyone (cascade).

- [ ] **Step 3: Build check**

Run: `DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build`
Expected: compiles; routes `/attendance`, `/attendance/export`, `/events/[id]/attendance`, `/events/[id]/attendance/export` listed.

- [ ] **Step 4: Update memory + final commit if verification changed anything**

```bash
git status --short   # expect clean, or commit any fixes with a "fix:" message
```
