import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDayInZone,
  daysUntil,
  coveredKinds,
  dueReminder,
  monthKey,
  digestSelection,
  shouldAnnounceOnCreate,
} from "../src/lib/event-schedule.ts";

const TZ = "America/New_York";
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

test("calendarDayInZone reads the wall-clock day in the zone, not UTC", () => {
  // 03:30Z on Oct 1 is still Sep 30, 23:30 EDT.
  assert.deepEqual(calendarDayInZone(new Date("2026-10-01T03:30:00Z"), TZ), { year: 2026, month: 8, day: 30 });
  assert.deepEqual(calendarDayInZone(new Date("2026-10-01T04:30:00Z"), TZ), { year: 2026, month: 9, day: 1 });
});

test("daysUntil counts calendar days from the zone's today to the UTC-midnight event date", () => {
  const event = utcDay(2026, 10, 7);
  assert.equal(daysUntil(event, new Date("2026-10-01T03:30:00Z"), TZ), 7); // Sep 30 EDT
  assert.equal(daysUntil(event, new Date("2026-10-01T04:30:00Z"), TZ), 6); // Oct 1 EDT
  assert.equal(daysUntil(event, new Date("2026-10-07T13:00:00Z"), TZ), 0);
  assert.equal(daysUntil(event, new Date("2026-10-08T13:00:00Z"), TZ), -1);
});

test("daysUntil is stable across the DST change", () => {
  // DST ends Nov 1 2026 at 2am ET. Nov 1 01:30 EDT → Nov 8 is 7 days; Nov 8 00:00 EST → 0.
  assert.equal(daysUntil(utcDay(2026, 11, 8), new Date("2026-11-01T05:30:00Z"), TZ), 7);
  assert.equal(daysUntil(utcDay(2026, 11, 8), new Date("2026-11-08T05:00:00Z"), TZ), 0);
});

test("coveredKinds: an email sent N days out covers every reminder whose threshold is >= N", () => {
  assert.deepEqual(coveredKinds(8), []);
  assert.deepEqual(coveredKinds(7), ["WEEK_BEFORE"]);
  assert.deepEqual(coveredKinds(5), ["WEEK_BEFORE"]);
  assert.deepEqual(coveredKinds(3), ["WEEK_BEFORE", "THREE_DAYS_BEFORE"]);
  assert.deepEqual(coveredKinds(2), ["WEEK_BEFORE", "THREE_DAYS_BEFORE"]);
  assert.deepEqual(coveredKinds(0), ["WEEK_BEFORE", "THREE_DAYS_BEFORE", "DAY_OF"]);
});

test("dueReminder: one send per day, most urgent kind, records everything it covers", () => {
  assert.deepEqual(dueReminder(7, []), { send: "WEEK_BEFORE", record: ["WEEK_BEFORE"] });
  assert.equal(dueReminder(5, ["WEEK_BEFORE"]), null);
  // Server was down on day 7: catch up on day 5.
  assert.deepEqual(dueReminder(5, []), { send: "WEEK_BEFORE", record: ["WEEK_BEFORE"] });
  assert.deepEqual(dueReminder(3, ["WEEK_BEFORE"]), { send: "THREE_DAYS_BEFORE", record: ["THREE_DAYS_BEFORE"] });
  // Nothing sent yet and only 2 days left: send the 3-day text, mark the week one covered too.
  assert.deepEqual(dueReminder(2, []), { send: "THREE_DAYS_BEFORE", record: ["WEEK_BEFORE", "THREE_DAYS_BEFORE"] });
  assert.deepEqual(dueReminder(0, ["WEEK_BEFORE", "THREE_DAYS_BEFORE"]), { send: "DAY_OF", record: ["DAY_OF"] });
  assert.equal(dueReminder(0, ["WEEK_BEFORE", "THREE_DAYS_BEFORE", "DAY_OF"]), null);
  // ANNOUNCED alone doesn't block reminders; the covered kinds recorded with it do.
  assert.deepEqual(dueReminder(7, ["ANNOUNCED"]), { send: "WEEK_BEFORE", record: ["WEEK_BEFORE"] });
  assert.equal(dueReminder(8, []), null);
  assert.equal(dueReminder(-1, []), null);
});

test("shouldAnnounceOnCreate: only events happening within the next 7 days (today included)", () => {
  assert.equal(shouldAnnounceOnCreate(0), true);
  assert.equal(shouldAnnounceOnCreate(7), true);
  assert.equal(shouldAnnounceOnCreate(8), false);
  assert.equal(shouldAnnounceOnCreate(-1), false);
});

test("monthKey uses the zone's month", () => {
  assert.equal(monthKey(new Date("2026-10-01T03:30:00Z"), TZ), "2026-09");
  assert.equal(monthKey(new Date("2026-10-01T13:00:00Z"), TZ), "2026-10");
});

test("digestSelection: this month's remaining events, sent only if something is more than a week out", () => {
  const now = new Date("2026-10-01T13:00:00Z"); // Oct 1, 9am EDT
  const events = [
    { id: "sep", date: utcDay(2026, 9, 28) },
    { id: "oct15", date: utcDay(2026, 10, 15) },
    { id: "oct3", date: utcDay(2026, 10, 3) },
    { id: "nov2", date: utcDay(2026, 11, 2) },
  ];
  const sel = digestSelection(events, now, TZ);
  assert.deepEqual(sel.events.map((e) => e.id), ["oct3", "oct15"]);
  assert.equal(sel.shouldSend, true);
  const near = digestSelection([events[2]], now, TZ);
  assert.deepEqual(near.events.map((e) => e.id), ["oct3"]);
  assert.equal(near.shouldSend, false);
  assert.equal(digestSelection([], now, TZ).shouldSend, false);
});
