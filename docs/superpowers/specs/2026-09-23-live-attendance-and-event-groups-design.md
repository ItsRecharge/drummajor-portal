# Live attendance, Publish, multi-group events, Concert/Jazz Band Only — design

**Date:** 2026-09-23 · **Branch:** `feat/live-attendance`

## Goal

Let several drum majors take attendance for the same band event at once, with every
tap saved immediately and visible to everyone; replace the Save button with an explicit
**Publish** step (confirmed in a dialog) that sends the absence emails; let an event
expect one or more class lists; add a fourth built-in list, **Concert/Jazz Band Only**.

Nothing is emailed automatically any more: an unpublished sheet never emails anyone.
The 30-minute grace period is gone.

Out of scope: per-tap audit rows, "who marked this student", editing drum-major
events, group filters on the public calendar, any scheduled absence email.

## Data model

Migration `9a_event_groups_publish` (must sort after `9_absence_appeals`):

```prisma
model EventGroup {
  eventId String
  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  groupId String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([eventId, groupId])
  @@index([groupId])
}

model Event {
  // attendanceGroupId removed
  groups                  EventGroup[]      // none = Everyone
  attendanceTakenAt       DateTime?         // last edit
  attendancePublishedAt   DateTime?         // set once by publish
  attendancePublishedById String?           // null after a user is deleted
}
```

Existing `attendanceGroupId` values are copied into `EventGroup`. Sheets saved under the
old flow are backfilled as published (`attendancePublishedAt = attendanceTakenAt`) so their
absence emails are neither stranded nor re-queued.

## Groups

`BUILTIN_GROUPS` = Everyone, Jazz Band, Concert/Marching Band, **Concert/Jazz Band Only**
(`src/lib/group-names.ts`, pure; `src/lib/groups.ts` re-exports it and keeps the Prisma
helpers). `ensureBuiltInGroups` upserts the new one lazily. Membership is curated like
the other lists (Classroom import, per-contact edit).

`normalizeGroupSelection(ids, groups)` (pure): rejects an empty selection, drops ids that
are not built-in groups, collapses to just Everyone when Everyone is selected, keeps the
built-in order.

## Events

- Form: "Who's expected" checkbox chips (`name="groupIds"`), Everyone checked by default.
  Same component serves create and edit (`initial` prop, hidden `eventId`).
- `createEventAction` writes `EventGroup` rows. New `updateEventAction` (band events only)
  updates the scalars, replaces the `EventGroup` rows, and — when the date changed —
  deletes the event's `EventNotice` rows so the reminder schedule restarts.
- New page `/events/[id]/edit`. The list shows group names, an Edit link, and badges
  **In progress** / **Published** instead of Taken.
- `sendEventEmail` fans out to every group on the event (one Announcement, N recipient
  groups; the queue de-duplicates); no rows = Everyone.

## Attendance sheet

Roster = union of the event's groups' members (Everyone = whole roster) plus anyone who
already has a record. A student with no record shows as Absent.

- `markAttendanceAction(eventId, contactId, status)`: upserts one row, sets
  `attendanceTakenAt`, auto-approves a pending appeal when the status leaves Absent,
  returns the fresh snapshot and broadcasts it. No `revalidatePath` (that would refetch
  the page on every tap), no audit row.
- `markAllAction(eventId, status)`: creates missing rows + updates existing. Audited.
  "Mark all absent" is confirmed in a dialog because it overwrites everyone's marks.
- `publishAttendanceAction(eventId)`: requires a started sheet and an event day that is
  today or earlier (America/New_York); creates an Absent row for every roster contact
  still without one ("expected" for the season summary), then
  `updateMany({ where: { id, attendancePublishedAt: null } })` so two simultaneous
  publishes can't both win (the loser gets "Already published."). Audited. Runs
  `processAbsenceEmails()` in `after()` so the emails leave at once. Only sheet action
  that revalidates.
- After publish the sheet stays editable; a student newly marked Absent is emailed on the
  next worker tick (no second confirm). Students who leave a group keep their rows.

### Live sync

`src/lib/attendance-live.ts` (pure, registry on `globalThis` unconditionally so the
route-handler and server-action bundles share one instance): `subscribeSheet`,
`broadcastFrame`, `joinPresence` / `leavePresence` / `presenceNames`, `sseFrame`.
`loadSheetSnapshot` / `broadcastSheet` (Prisma) live in `attendance-data.ts`.

Route `GET /events/[id]/attendance/live` (leadership only, checks auth itself): SSE
stream — `retry: 3000`, `snapshot` + `presence` on open, `snapshot` on every broadcast,
`presence` on join/leave, `: ping` every 25 s; headers `text/event-stream`,
`Cache-Control: no-cache, no-transform` (keeps `next start`'s compression off),
`X-Accel-Buffering: no`. Cleanup on `request.signal` abort and stream cancel.

Snapshot: `{ version, rows[{ id, name, instrument, status, emailedAt }], groups[], takenAt,
publishedAt, publishedBy, eventDay }`, serializable. Clients ignore a snapshot with an
older `version`.

Client: `base` snapshot + `pending` overrides; a tap sets the override, calls the action
in `startTransition`, applies the returned snapshot, then clears the override (no
flicker). Server actions are FIFO per tab, so a double tap ends on the last tap.
`EventSource` reconnects on its own and every connect gets a fresh snapshot. Pills:
"Saving…" / "All changes saved · last change …" / "Reconnecting…"; "Also here: <names>";
envelope icon on rows already emailed.

## Worker

`processAbsenceEmails` sends for rows `ABSENT`, not yet emailed, whose event is published.
In-process `running` guard so the publish-triggered run and the minute tick never overlap.
Broadcasts the sheet after each event's batch. Appeal decisions broadcast too.

## Edge cases

Two DMs tap the same student → last write wins, both see it. Rapid double tap → FIFO,
last tap wins. Action failure → override reverted, error toast. Reconnect → full snapshot.
DM A still marking when B publishes → A's later Absent marks email on the next tick; A's
banner flips live. Double publish → one winner. Untouched sheet → Publish disabled.
Future-dated event → Publish blocked (UI + action). Never published → nobody emailed.
Group added before publish → new members show Absent, rows created at publish. Group
added after publish → new members show unmarked, emailed only if marked Absent (edit page
says so). In-progress sheets are excluded from the season summary.

## Testing

Pure modules under `node --test`: `group-names` (selection normalization, built-in order),
`attendance` (`buildSheetRows`, `applyPending`), `attendance-live` (scoped delivery,
idempotent unsubscribe, presence, SSE framing, shared registry across module instances).
Manual/Playwright on the Docker e2e DB: two sessions on one sheet, publish dialog, SMTP
sink receives one absence email per absent student, post-publish mark emails on the next
tick, edit event groups/date, `/attendance` picker shows the new list.
