# Event attendance — design

**Date:** 2026-09-16 · **Branch:** `feat/attendance`

## Goal

Let drum majors and admins take attendance for band events from the portal and see
who has been showing up across the season. Attendance is marked against the roster
(`Contact` rows imported from Google Classroom), grouped by class list.

Out of scope: drum-major (leadership) events, emailing absentees, editing past sheets
from the summary page, per-student notes.

## Data model

Migration `7_attendance`:

```prisma
enum AttendanceStatus { PRESENT ABSENT LATE EXCUSED }

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

model Event {
  // ...existing fields...
  attendanceGroupId String?
  attendanceGroup   Group?    @relation(fields: [attendanceGroupId], references: [id], onDelete: SetNull)
  attendanceTakenAt DateTime?
  attendance        AttendanceRecord[]
}
```

`Contact` and `Group` get the matching back-relations. A student is "expected" at an
event iff they have an `AttendanceRecord` for it; saving a sheet writes one row for
every member of the chosen group, so expected == group membership at save time.

## Pure module `src/lib/attendance.ts` (unit-tested)

- `ATTENDANCE_STATUSES` (ordered `PRESENT, LATE, EXCUSED, ABSENT`) and
  `ATTENDANCE_LABELS` for UI text.
- `parseAttendanceForm(formData, expectedContactIds)` → `Map<contactId, status>`.
  Reads `status:<contactId>` fields; unknown values and unlisted contacts are ignored;
  expected contacts with no field default to `ABSENT`.
- `countStatuses(statuses)` → `{ present, late, excused, absent }`.
- `summarizeAttendance(records)` → per-contact rows
  `{ contactId, expected, present, late, excused, absent, rate }` where
  `rate = (present + late) / (expected − excused)`, or `null` when the denominator is 0.
- `attendanceRate(row)` formatting helper (`"92%"` / `"—"`).
- `eventAttendanceCsv(rows)` and `attendanceSummaryCsv(rows)` — CSV text with a header
  row; cells quoted when they contain `"`, `,` or newlines (same rules as
  `music-index-csv.ts`).

## Screens

### Event list (`/events`)

Band-event rows get an **Attendance** link to `/events/[id]/attendance` and a
**Taken** badge when `attendanceTakenAt` is set. `EventList` takes a
`showAttendance` prop; the drum-major page leaves it off.

### Sheet `/events/[id]/attendance`

Roles: `ADMIN`, `DRUM_MAJOR`. 404 for missing or `DRUM_MAJORS` events.

- Header: event title, formatted date/time, back link.
- Group picker (`Jazz Band` / `Concert/Marching Band` / `Everyone`). Reads `?group=`,
  else the event's saved `attendanceGroupId`, else Everyone. Changing it navigates
  with the query param (client `router.replace`).
- Name filter box (client-side, matches name or instrument).
- One row per contact in the group: name, instrument, and a four-way segmented toggle
  (Present / Late / Excused / Absent). Hidden `status:<contactId>` inputs carry state.
- Fresh sheet (no records for this event): every student starts **Absent**; you mark
  who is there. Existing sheet: rows start from saved records; contacts newly in the
  group start Absent.
- "Mark all present" / "Mark all absent" buttons; live counts above the table.
- **Save attendance** → `saveAttendanceAction`. **Export CSV** links to
  `/events/[id]/attendance/export`.

### Summary `/attendance`

Sidebar item **Attendance** under *Band* (icon `ClipboardCheck`). Roles: leadership.

- Group filter (same three groups, default Everyone) via `?group=`.
- Table: student, instrument, expected, present, late, excused, absent, rate. Sorted
  by name; students with zero expected events still listed (rate `—`).
- Count of events with attendance taken shown above the table.
- **Export CSV** → `/attendance/export?group=`.

## Server actions and routes

`src/app/(app)/events/[id]/attendance/actions.ts`

- `saveAttendanceAction(prev, formData)`: require leadership; load event (must be
  `BAND`); load group; `resolveGroupMemberIds(group)`; `parseAttendanceForm`; in one
  transaction `deleteMany({ eventId })`, `createMany(rows)`, update event
  `{ attendanceGroupId, attendanceTakenAt: now }`. `logAudit` `ATTENDANCE_SAVED` with
  `{ group, counts }`. `revalidatePath` for `/events`, the sheet, and `/attendance`.
  Returns `{ success, message }` for a toast.

`src/app/(app)/events/[id]/attendance/export/route.ts` and
`src/app/(app)/attendance/export/route.ts`: `GET`, leadership only (401 otherwise),
`text/csv` with `Content-Disposition: attachment`. File names
`attendance-<yyyy-mm-dd>-<slug>.csv` and `attendance-summary-<group-slug>.csv`.

## Error handling

- Validation failures (unknown event, wrong audience, unknown group) return
  `{ error }` and leave data untouched.
- Deleting an event or contact cascades their records; deleting a group nulls
  `attendanceGroupId` (records stay, so history survives).

## Testing

- `tests/attendance.test.ts` (node:test) covers form parsing defaults, status counts,
  summary math including the excused denominator and zero-expected rows, and CSV
  escaping.
- Manual/Playwright on PGlite: create a band event, open the sheet, switch group, mark
  a few students, save, reload (state persists), re-save with a different group
  (stale rows gone), export both CSVs, check `/attendance` totals and the Taken badge.
