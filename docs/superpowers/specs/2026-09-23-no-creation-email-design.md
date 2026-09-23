# Band events: no creation email — design

**Date:** 2026-09-23. Supersedes the "email on create within 7 days" rule in
`2026-09-17-event-comms-and-appeals-design.md`. Everything else there stands.

## Rule

Adding a band event sends no email. The daily 9 AM job does all the emailing:
one week before, three days before, the morning of, and the monthly overview.
There is no per-event option.

One exception: an event added **for today** gets the day-of email immediately
(`creationNotice` in `src/lib/event-schedule.ts`, wired through
`announceIfToday` in `src/lib/event-comms.ts`). Without it, an event added after
the 9 AM run would never be emailed, because tomorrow it is in the past.

## Decisions

1. **Bell stays.** Creating a band event still notifies every portal user
   in-app (`notifyAll("EVENT")`), now unconditionally.
2. **"Emailed" badge** on the band events list means "at least one email has
   gone out": `notify || notices.length > 0`. `Event.notify` remains the
   drum-major "Invited" flag and the legacy creation-email flag. No schema
   change.
3. **`ANNOUNCED` notice kind stays** in the Postgres enum and the TS union;
   existing rows hold it and `dueReminder` ignores it.
4. **Monthly overview rule unchanged**: sent when some event this month is more
   than `REMINDER_THRESHOLDS.WEEK_BEFORE` days away. `ANNOUNCE_WINDOW_DAYS` is
   gone.
5. **Boot-time catch-up.** `startScheduler` runs `runDailyEventJobs()` once at
   boot as well as at 9 AM. `EventNotice` (unique event+kind) and `DigestLog`
   (unique month) make it idempotent. This is what brings pre-existing events
   into the new regime at deploy: anything within the week with nothing sent
   gets its most urgent outstanding reminder right away.

## Old data

No migration. Reminders never filtered on `notify`; events created under the
old checkbox have no `EventNotice` rows and enter the reminder flow as soon as
the new code runs. Events that got a creation email under the 7-day rule carry
`ANNOUNCED` plus the reminder kinds it covered, which remains correct.

## Repo gotcha: migration folder names

Prisma applies migration folders in lexicographic name order. This repo numbers
them `0_` … `9_`; a folder named `10_…` sorts **before** `1_…`, `2_…` and
`7_`–`9_`, so on a database that has not applied `8_event_comms` yet it would
run first and any SQL touching `EventNotice` would fail. The next migration
must sort after `9_absence_appeals` (for example `9a_…`).

## Deploy

`deploy/update-and-run.sh` now records the built commit in
`.next/BUILD_COMMIT` and rebuilds (deps, `prisma generate`, `migrate deploy`,
`next build`) whenever HEAD differs from it, so a manual `git pull` followed by
a service restart can no longer run a stale build against an unmigrated
database.
