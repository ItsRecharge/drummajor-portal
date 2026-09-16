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
