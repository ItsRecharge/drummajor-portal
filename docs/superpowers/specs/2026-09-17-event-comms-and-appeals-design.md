# Event communications + absence appeals — plan

## Context

Attendance (branch `feat/attendance`, unmerged) lets leadership mark Present/Late/Excused/Absent per band event. The user now wants the portal to (1) email absent students automatically with a unique appeal link, (2) stop emailing the whole roster every time an event is created unless it is within a week, (3) show events on a public calendar, (4) send a monthly look-ahead digest, and (5) send reminders a week, three days, and the day before each event that carry the conflict policy: *email Mr. Costello, CC Jake Killian; unless it is a genuine emergency, conflicts must be cleared 3 days ahead or a cut is recorded.*

User decisions (2026-09-17): appeal = public form reviewed by leadership (approve → Excused / deny); events get a "who's expected" class list picked at creation (default Everyone); digest/reminders go out at **9 AM**; conflict contacts live in an admin **Settings** card with names pre-filled and emails left blank for the user to enter.

Assumptions (stated, not asked): all scheduled sends run at 9:00 AM `America/New_York`; absent emails go out **30 minutes after the sheet was last saved** (protects against the fresh-sheet-all-absent accident, and re-saving restarts the timer); Late students are not emailed; only BAND events get calendar/reminder/absence treatment; DM events unchanged.

Build in two specs/branches, in order: **A. Event communications + public calendar**, then **B. Absence emails + appeals** (B depends on A's settings card and email layout refactor). Both branch off `feat/attendance`.

---

## A. Event communications + public calendar

### Data model (migration `8_event_comms`)

```prisma
enum EventNoticeKind { ANNOUNCED  WEEK_BEFORE  THREE_DAYS_BEFORE  DAY_OF }

model EventNotice {            // one row per email kind actually covered for an event
  id             String @id @default(cuid())
  eventId        String
  event          Event  @relation(fields:[eventId], references:[id], onDelete: Cascade)
  kind           EventNoticeKind
  announcementId String?        // the queued Announcement that carried it (null when "covered" by an earlier send)
  sentAt         DateTime @default(now())
  @@unique([eventId, kind])
}

model DigestLog { id String @id @default(cuid()); period String @unique /* "2026-10" */; announcementId String?; sentAt DateTime @default(now()) }

// AppSettings additions
absenceContactName  String?   absenceContactEmail String?
absenceCcName       String?   absenceCcEmail      String?
```
Migration also seeds `UPDATE "AppSettings" SET "absenceContactName"='Mr. Costello', "absenceCcName"='Jake Killian'`. `Event.attendanceGroupId` (exists) becomes "who's expected", set at creation. `Event.notify` keeps meaning "announced at creation".

### Pure modules (node:test, relative `.ts` imports, no Prisma)

- `src/lib/email-layout.ts` — **extract** `shell`, `layout`, `button`, `meta`, `escapeText` from `src/lib/email.ts:40-135` unchanged; `email.ts` re-imports them. Makes new templates testable.
- `src/lib/event-schedule.ts`
  - `calendarDayInZone(now, tz)` → `{y,m,d}` via `Intl.DateTimeFormat`; `todayUtcInZone(now, tz)` → UTC-midnight Date (events are stored UTC-midnight, see `event-dates.ts:1-3`).
  - `daysUntil(eventDate, now, tz)` integer.
  - `REMINDER_THRESHOLDS = { WEEK_BEFORE: 7, THREE_DAYS_BEFORE: 3, DAY_OF: 0 }`.
  - `coveredKinds(daysUntil)` → kinds whose threshold ≥ daysUntil (a creation email 5 days out covers WEEK_BEFORE; 2 days out covers WEEK + THREE; 0 covers all).
  - `dueReminder(daysUntil, sentKinds)` → the single most urgent kind to send now (`null` if none) plus the set of kinds to record. Rule: candidates = kinds with threshold ≥ daysUntil not yet sent; send the smallest-threshold one; record all candidates. Gives at most one reminder per event per day and self-heals after downtime.
  - `monthKey(now, tz)` → `"2026-10"`; `digestSelection(events, now, tz)` → events in this calendar month with daysUntil ≥ 0, and `shouldSendDigest` = any with daysUntil > 7.
- `src/lib/event-emails.ts` — templates returning `{subject, html}` built on `email-layout`: `eventCreatedEmail`, `eventReminderEmail(kind)`, `monthlyDigestEmail(events)`, all taking `{ title, when, location?, description?, calendarUrl, policy: { contactName, contactEmail?, ccName, ccEmail? }, bandName? }`. `conflictPolicyHtml(policy)` renders the policy paragraph with a `mailto:contact?cc=cc&subject=...` link when emails are set, plain names otherwise. Reuse `formatEventWhen` from `src/app/(app)/events/event-dates.ts` at call sites (it is already pure).
- `src/lib/ics.ts` — refactor `buildIcs` into `vevent(ev)` + `buildIcs` (METHOD:REQUEST, single) + new `buildCalendarFeed(events: IcsEvent[], name)` (METHOD:PUBLISH, `X-WR-CALNAME`). Existing `tests/ics.test.ts` must stay green.

### Prisma-facing helpers `src/lib/event-comms.ts`

- `getAttendancePolicy()` → the four settings fields (fallback names "Mr. Costello"/"Jake Killian").
- `sendEventEmail(event, kind, opts)` — the generalisation of `announceBandEvent` (`src/app/(app)/events/actions.ts:29-49`): create `Announcement` (author = `event.createdById` ?? oldest ADMIN, `prisma.user.findFirst({ where:{role:ADMIN}, orderBy:{createdAt:"asc"} })`), one `AnnouncementRecipientGroup` for `event.attendanceGroupId` ?? Everyone, `enqueueAnnouncement`, `notifyAll("EVENT"…)` only for ANNOUNCED, then `EventNotice` rows for `coveredKinds`. Leadership is auto-cc'd by `resolveRecipients` (`announce.ts:32`).
- `runDailyEventJobs(now = new Date())` — for each BAND event with `daysUntil` in 0..7: `dueReminder` → `sendEventEmail(REMINDER)` + record. Then digest: if `DigestLog` for `monthKey` missing and `shouldSendDigest` → one Announcement to Everyone listing this month's remaining events, record `DigestLog`. Idempotent; safe to call every day (covers a server down on the 1st).
- `scheduler.ts`: add `cron.schedule("0 9 * * *", runDailyEventJobs, { timezone: "America/New_York" })`.

### Event creation rule (`src/app/(app)/events/actions.ts`, `event-form.tsx`, `validation.ts`)

- `eventSchema` gains `groupId: z.string().optional()`; band form gets a "Who's expected" `<select name="groupId">` (built-in groups from `getAttendanceGroups()`, default Everyone) and **drops the "Email everyone" checkbox**, replaced by copy: *"Emailed now only if it's within a week. Otherwise it appears on the public calendar, in the monthly overview, and in reminders a week, three days and the morning of."*
- `createEventAction`: store `attendanceGroupId`; if `daysUntil(date) <= 7` → `sendEventEmail(event, "ANNOUNCED")` (sets `notify: true`), else nothing. DM path unchanged.
- `event-list.tsx`: badge text from notices — "Emailed" (ANNOUNCED) stays; add small "Reminders: 7d ✓ 3d ✓" hint only if cheap; otherwise skip (YAGNI).

### Public calendar

- `src/app/(open)/layout.tsx` — new route group: wide, branded header (Flag + band name from `Organization`), no nav, `isSetupComplete()` guard like `(public)/layout.tsx:7`.
- `src/app/(open)/calendar/page.tsx` — upcoming BAND events grouped by month (date badge, title, weekday, time, location, description), "Subscribe (.ics)" link, "Leadership login" link. `force-dynamic`. No auth; `/calendar` is not in `proxy.ts` matcher so it is already public.
- `src/app/calendar.ics/route.ts` — `buildCalendarFeed` of upcoming BAND events (plus past 30 days), `text/calendar`, `Cache-Control: public, max-age=300`.
- `appBaseUrl()`-based `calendarUrl` goes into every event email; dashboard hero gets a "Public calendar" outline link next to the guide link (`dashboard/page.tsx:96`); guide gets a short "Events, reminders and the public calendar" section.

### Settings card

- `src/app/(app)/settings/attendance-policy-forms.tsx` (client, pattern of `smtp-forms.tsx`): four fields, one `useActionState`; `saveAttendancePolicyAction` in `settings/actions.ts` (ADMIN only, `attendancePolicySchema` in `validation.ts`, `logAudit ATTENDANCE_POLICY_UPDATED`). Rendered in `settings/page.tsx` after SMTP for admins.

---

## B. Absence emails + appeals

### Data model (migration `9_absence_appeals`)

```prisma
enum AppealStatus { PENDING APPROVED DENIED }
// AttendanceRecord additions
absenceEmailedAt DateTime?
appealToken      String?  @unique
appeal           AbsenceAppeal?

model AbsenceAppeal {
  id          String @id @default(cuid())
  eventId     String
  contactId   String
  record      AttendanceRecord @relation(fields:[eventId, contactId], references:[eventId, contactId], onDelete: Cascade)
  reason      String
  status      AppealStatus @default(PENDING)
  submittedAt DateTime @default(now())
  decidedAt   DateTime?
  decidedById String?
  decidedBy   User? @relation(fields:[decidedById], references:[id], onDelete: SetNull)
  @@unique([eventId, contactId])
  @@index([status])
}
```

### Absent email job (`src/lib/absence.ts`, scheduler every-minute tick)

- `processAbsenceEmails(now)`: records `status=ABSENT`, `absenceEmailedAt=null`, `event.audience=BAND`, `event.attendanceTakenAt <= now − 30 min`; batch 40; skip entirely if `getSmtpConfig()` null; per record: set `appealToken = randomToken()` if null, `sendMail(absenceEmail(...))`, set `absenceEmailedAt`; log failures, never throw.
- `absenceEmail` template (pure, in `src/lib/event-emails.ts`): "You were marked **absent** from *{title}* on {when}. Attendance is mandatory and may impact your grade. If this absence was excused — or you were there — and it wasn't recorded correctly, appeal here: [Appeal this absence]. {conflict policy paragraph}."
- Sheet page copy: "Absent students are emailed automatically 30 minutes after the sheet is saved (re-saving restarts the clock)."

### Public appeal page

- `src/app/(open)/appeal/[token]/page.tsx` + `appeal-form.tsx` + `src/app/(open)/appeal/actions.ts` (pattern of `(public)/invite/[token]`): look up `AttendanceRecord` by `appealToken` with event + contact + appeal. States: unknown token → "Link not valid"; record no longer ABSENT → "This absence has already been cleared"; appeal exists → show status (Pending / Approved / Denied + policy contacts); else textarea "Why should this absence be excused?" (min 10 chars) → `submitAppealAction` creates `AbsenceAppeal`, `notifyAll("APPEAL", {student, event})`, `emailLeadership` a short heads-up (fire-and-forget via `after`).

### Review UI (`/attendance` page)

- New "Appeals" card above the summary: pending rows (student, event + date, reason, submitted) with **Approve** / **Deny** forms → `decideAppealAction` in `src/app/(app)/attendance/actions.ts` (leadership roles): transaction sets appeal `status/decidedAt/decidedById` and, on approve, `AttendanceRecord.status = EXCUSED`; `logAudit APPEAL_APPROVED|APPEAL_DENIED`; `after(() => sendMail(appealDecisionEmail))` to the student; revalidate `/attendance` and the sheet. Decided appeals in a collapsed `<details>` (last 50).
- Sidebar badge not needed; the in-app notification bell already covers it.

---

## Files (representative)

| Area | Create | Modify |
|---|---|---|
| Pure | `src/lib/email-layout.ts`, `src/lib/event-schedule.ts`, `src/lib/event-emails.ts`, `tests/event-schedule.test.ts`, `tests/event-emails.test.ts` | `src/lib/email.ts`, `src/lib/ics.ts`, `tests/ics.test.ts` |
| Data | `prisma/migrations/8_event_comms/`, `prisma/migrations/9_absence_appeals/` | `prisma/schema.prisma` |
| Server | `src/lib/event-comms.ts`, `src/lib/absence.ts` | `src/lib/scheduler.ts`, `src/lib/validation.ts`, `src/app/(app)/events/actions.ts` |
| UI | `src/app/(open)/layout.tsx`, `(open)/calendar/page.tsx`, `src/app/calendar.ics/route.ts`, `(open)/appeal/[token]/*`, `settings/attendance-policy-forms.tsx` | `events/event-form.tsx`, `events/page.tsx`, `settings/page.tsx`, `settings/actions.ts`, `attendance/page.tsx`, `attendance/actions.ts`, `dashboard/page.tsx`, `guide/page.tsx`, `docs/plan.md` |

Reuse: `enqueueAnnouncement`/`resolveRecipients` (`src/lib/announce.ts`), `notifyAll`/`emailLeadership`, `randomToken` (`src/lib/tokens.ts`), `escapeHtml` (`src/lib/sanitize.ts`), `formatEventWhen`/`todayUtc` (`events/event-dates.ts`), `getAttendanceGroups`/`pickAttendanceGroup` (`src/lib/attendance-data.ts`), `parseForm`/`ActionState`, `logAudit`, `useActionState` + `SubmitButton` + `Field` patterns.

## Verification

1. `npm test` — new pure suites: `daysUntil` across DST and month edges; `coveredKinds`/`dueReminder` table (created 7/5/2/0 days out; downtime catch-up; no double send); `digestSelection`; template HTML contains policy text, mailto with cc, calendar link, escaped titles; `buildCalendarFeed` emits N VEVENTs with METHOD:PUBLISH and existing `buildIcs` tests unchanged.
2. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against the Docker shadow DB → empty.
3. Playwright on PGlite (`DATABASE_URL="" PORT=3005 npm run dev`; admin@winchesterps.org / Password123!; add contacts first): create event 10 days out → no announcement created, appears on `/calendar` (logged-out context) and in `/calendar.ics`; create event 3 days out → announcement SENDING with the policy paragraph; call `runDailyEventJobs(fakeNow)` via a scratchpad script against Postgres (or a hidden admin-only POST used only in dev) and assert `EventNotice` rows + one announcement per day; digest row once per month. Settings card saves the four contacts and the mailto appears in the next reminder body.
4. Appeals: save a sheet with one Absent, run `processAbsenceEmails(now + 31 min)`, assert `appealToken` + `absenceEmailedAt` set and an announcement-free `sendMail` call (SMTP unconfigured on PGlite → job skips; verify with the Docker Postgres + a dummy SMTP via `smtp4dev`/Mailpit if available, else assert the DB side and the rendered template). Open `/appeal/<token>` logged out → submit → pending on `/attendance` → Approve → record Excused, appeal link now shows Approved; Deny path likewise.
5. `DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build` lists `/calendar`, `/calendar.ics`, `/appeal/[token]`.
6. Never open `.pglite` from a second process while dev runs (corrupted it on 2026-09-16).

---

## Amendment (2026-09-17, later the same day)

The CC is no longer a free-text name/email. `AppSettings.absenceCcUserId` points at a portal user (drum major or
admin, `onDelete: SetNull`); their current name and email are used in every policy sentence. Settings → Attendance
policy offers a picker of leadership users. While no valid CC user exists (never set, deleted, or demoted below
leadership) every leader who signs in sees a banner across the app asking them to pick one; any leader can answer
it. Emails omit the "and CC …" clause until someone is set. `absenceCcName`/`absenceCcEmail` were dropped from
migration 8 before it shipped.
