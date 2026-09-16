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
