import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKIN_ERRORS,
  CHECKIN_FLAGS,
  CHECKIN_FLAG_LABELS,
  EDGE_FRACTION,
  LATE_GRACE_MIN,
  MAX_ACCURACY_M,
  checkDeviceBinding,
  checkLocation,
  computeFlags,
  evaluateSubmission,
  isCheckInFlag,
  isLateScan,
  minuteOfDayInZone,
  sessionOpen,
  type SessionState,
} from "../src/lib/checkin-rules.ts";

const anchor = { lat: 42.452, lng: -71.137 };
// 2026-09-25 14:00 EDT (18:00Z), a Friday.
const now = new Date("2026-09-25T18:00:00Z");
const open: SessionState = {
  enabled: true,
  audience: "BAND",
  eventDate: new Date("2026-09-25T00:00:00Z"),
  time: "14:30",
  openedAt: new Date("2026-09-25T17:50:00Z"),
  closedAt: null,
  anchor,
  radiusM: 150,
};
// ~0.001° lat ≈ 111 m north of the anchor.
const near = { lat: 42.453, lng: -71.137, accuracyM: 20 };

test("constants and flags", () => {
  assert.equal(MAX_ACCURACY_M, 200);
  assert.equal(EDGE_FRACTION, 0.7);
  assert.equal(LATE_GRACE_MIN, 10);
  assert.deepEqual(CHECKIN_FLAGS, ["DUP_NAME", "NEW_DEVICE", "EDGE", "LATE"]);
  assert.equal(CHECKIN_FLAG_LABELS.NEW_DEVICE, "New phone");
  assert.ok(isCheckInFlag("EDGE"));
  assert.ok(!isCheckInFlag("edge"));
});

test("sessionOpen: open band event today passes", () => {
  assert.deepEqual(sessionOpen(open, now), { ok: true });
});

test("sessionOpen: each closed reason in order", () => {
  assert.deepEqual(sessionOpen({ ...open, enabled: false }, now), { ok: false, error: CHECKIN_ERRORS.DISABLED });
  assert.deepEqual(sessionOpen({ ...open, audience: "DRUM_MAJORS" }, now), { ok: false, error: CHECKIN_ERRORS.NOT_BAND });
  assert.deepEqual(sessionOpen({ ...open, openedAt: null }, now), { ok: false, error: CHECKIN_ERRORS.CLOSED });
  assert.deepEqual(sessionOpen({ ...open, closedAt: now }, now), { ok: false, error: CHECKIN_ERRORS.CLOSED });
  assert.deepEqual(sessionOpen({ ...open, anchor: null }, now), { ok: false, error: CHECKIN_ERRORS.CLOSED });
  assert.deepEqual(sessionOpen({ ...open, eventDate: new Date("2026-09-26T00:00:00Z") }, now), {
    ok: false,
    error: CHECKIN_ERRORS.NOT_TODAY,
  });
});

test("sessionOpen: 'today' is the band's day in New York, not UTC", () => {
  // 03:30Z on Sep 25 is still 23:30 on Sep 24 in New York.
  assert.equal(sessionOpen(open, new Date("2026-09-25T03:30:00Z")).ok, false);
  // 04:01Z is 00:01 on Sep 25 in New York.
  assert.equal(sessionOpen(open, new Date("2026-09-25T04:01:00Z")).ok, true);
  // And a Sep 24 event is over once New York rolls to Sep 25.
  const yesterday = { ...open, eventDate: new Date("2026-09-24T00:00:00Z") };
  assert.equal(sessionOpen(yesterday, new Date("2026-09-25T03:30:00Z")).ok, true);
  assert.equal(sessionOpen(yesterday, new Date("2026-09-25T04:01:00Z")).ok, false);
});

test("checkLocation: no fix, imprecise fix, too far, or a distance", () => {
  assert.deepEqual(checkLocation(null, anchor, 150), { ok: false, error: CHECKIN_ERRORS.NO_LOCATION });
  assert.deepEqual(checkLocation({ ...near, accuracyM: 201 }, anchor, 150), {
    ok: false,
    error: CHECKIN_ERRORS.IMPRECISE,
  });
  assert.equal(checkLocation({ ...near, accuracyM: 200 }, anchor, 150).ok, true);
  assert.deepEqual(checkLocation(near, anchor, 100), { ok: false, error: CHECKIN_ERRORS.TOO_FAR });
  const r = checkLocation(near, anchor, 150);
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(Math.abs(r.distanceM - 111.2) < 0.5, `distance ${r.distanceM}`);
  // exactly on the fence is inside
  assert.equal(checkLocation(near, anchor, Math.ceil(r.ok ? r.distanceM : 0)).ok, true);
});

test("checkDeviceBinding: fresh or same-student phones pass; another student's phone is refused by name", () => {
  assert.deepEqual(checkDeviceBinding([], "a"), { ok: true });
  assert.deepEqual(checkDeviceBinding([{ contactId: "a", contactName: "Ann Lee" }], "a"), { ok: true });
  assert.deepEqual(
    checkDeviceBinding(
      [
        { contactId: "a", contactName: "Ann Lee" },
        { contactId: "b", contactName: "Bo Li" },
      ],
      "b",
    ),
    { ok: false, error: CHECKIN_ERRORS.deviceBound("Ann Lee") },
  );
  assert.equal(CHECKIN_ERRORS.deviceBound("Ann Lee"), "This phone already checked in as Ann Lee. See a drum major.");
});

test("minuteOfDayInZone / isLateScan: New York wall clock with a 10-minute grace", () => {
  assert.equal(minuteOfDayInZone(new Date("2026-09-25T23:10:00Z")), 19 * 60 + 10); // 7:10 PM EDT
  assert.equal(isLateScan(null, new Date("2026-09-25T23:11:00Z")), false);
  assert.equal(isLateScan("garbage", new Date("2026-09-25T23:11:00Z")), false);
  assert.equal(isLateScan("19:00", new Date("2026-09-25T23:10:00Z")), false);
  assert.equal(isLateScan("19:00", new Date("2026-09-25T23:11:00Z")), true);
  assert.equal(isLateScan("19:00", new Date("2026-09-25T22:00:00Z")), false);
  // After the DST change (EST): 7:11 PM is 00:11Z next day.
  assert.equal(isLateScan("19:00", new Date("2026-11-03T00:11:00Z")), true);
  assert.equal(isLateScan("19:00", new Date("2026-11-03T00:10:00Z")), false);
});

test("computeFlags: none, edge threshold, all four in stable order", () => {
  const base = {
    distanceM: 50,
    radiusM: 150,
    otherDeviceForContactAtEvent: false,
    contactSeenOnOtherDevice: false,
    time: "14:30",
    now,
  };
  assert.deepEqual(computeFlags(base), []);
  assert.deepEqual(computeFlags({ ...base, distanceM: 105 }), []);
  assert.deepEqual(computeFlags({ ...base, distanceM: 106 }), ["EDGE"]);
  assert.deepEqual(
    computeFlags({
      ...base,
      distanceM: 140,
      otherDeviceForContactAtEvent: true,
      contactSeenOnOtherDevice: true,
      time: "13:00",
    }),
    ["DUP_NAME", "NEW_DEVICE", "EDGE", "LATE"],
  );
});

const roster = [
  { id: "a", name: "Ann Lee" },
  { id: "b", name: "Bo Li" },
];

test("evaluateSubmission: happy path returns the matched contact and distance", () => {
  const r = evaluateSubmission({ session: open, now, typedName: "ann lee", roster, location: near, deviceHistory: [] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.contact.id, "a");
    assert.ok(r.distanceM > 100 && r.distanceM < 120);
  }
});

test("evaluateSubmission: checks stop at the first failure, in order", () => {
  const closed = { ...open, closedAt: now };
  assert.deepEqual(
    evaluateSubmission({ session: closed, now, typedName: "nobody", roster, location: null, deviceHistory: [] }),
    { ok: false, error: CHECKIN_ERRORS.CLOSED },
  );
  assert.deepEqual(
    evaluateSubmission({ session: open, now, typedName: "nobody", roster, location: null, deviceHistory: [] }),
    { ok: false, error: CHECKIN_ERRORS.NO_LOCATION },
  );
  assert.deepEqual(
    evaluateSubmission({ session: open, now, typedName: "nobody", roster, location: near, deviceHistory: [] }),
    { ok: false, error: CHECKIN_ERRORS.NAME_NOT_FOUND },
  );
  assert.deepEqual(
    evaluateSubmission({
      session: open,
      now,
      typedName: "Ann Lee",
      roster: [...roster, { id: "a2", name: "ann lee" }],
      location: near,
      deviceHistory: [],
    }),
    { ok: false, error: CHECKIN_ERRORS.NAME_AMBIGUOUS },
  );
  assert.deepEqual(
    evaluateSubmission({
      session: open,
      now,
      typedName: "Ann Lee",
      roster,
      location: near,
      deviceHistory: [{ contactId: "b", contactName: "Bo Li" }],
    }),
    { ok: false, error: CHECKIN_ERRORS.deviceBound("Bo Li") },
  );
});
