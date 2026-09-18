import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABELS,
  isAttendanceStatus,
  parseAttendanceForm,
  countStatuses,
  summarizeAttendance,
  attendanceRate,
  formatRate,
  eventAttendanceCsv,
  attendanceSummaryCsv,
  slugify,
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
