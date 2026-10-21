import { test } from "node:test";
import assert from "node:assert/strict";
import { absenceEmail, appealDecisionEmail, appealSubmittedEmail, attendanceChangedEmail } from "../src/lib/absence-emails.ts";
import type { ConflictPolicy } from "../src/lib/event-emails.ts";

const policy: ConflictPolicy = { contactName: "Mr. Costello", contactEmail: "c@x.org", ccName: "Jake Killian", ccEmail: "j@x.org" };
const base = { studentName: "Ann <Lee>", title: "Fall Rehearsal", when: "Sat, Oct 3 at 6:00 PM", policy, bandName: "Winchester Band" };

test("absenceEmail: says absent, mandatory + grade, and links the personal appeal", () => {
  const { subject, html } = absenceEmail({ ...base, appealUrl: "https://p.example/appeal/tok123" });
  assert.equal(subject, "Marked absent: Fall Rehearsal — Sat, Oct 3 at 6:00 PM");
  assert.ok(html.includes("Ann &lt;Lee&gt;"));
  assert.ok(html.includes("marked <strong>absent</strong>"));
  assert.ok(html.includes("Attendance is mandatory") && html.includes("may impact your grade"));
  assert.ok(html.includes("excused") && html.includes("recorded correctly"));
  assert.ok(html.includes('href="https://p.example/appeal/tok123"'));
  assert.ok(html.includes("Appeal this absence"));
  assert.ok(html.includes("mailto:c@x.org?cc=j%40x.org"));
});

test("appealDecisionEmail: approved vs denied wording", () => {
  const ok = appealDecisionEmail({ ...base, approved: true });
  assert.equal(ok.subject, "Absence excused: Fall Rehearsal");
  assert.ok(ok.html.includes("Excused"));
  const no = appealDecisionEmail({ ...base, approved: false });
  assert.equal(no.subject, "Appeal not approved: Fall Rehearsal");
  assert.ok(no.html.includes("stays recorded as absent") && no.html.includes("Mr. Costello"));
});

test("appealSubmittedEmail (to leadership) quotes the reason and links the review page", () => {
  const { subject, html } = appealSubmittedEmail({ ...base, reason: "I was at the <dentist>", reviewUrl: "https://p.example/attendance" });
  assert.equal(subject, "Absence appeal: Ann <Lee> — Fall Rehearsal");
  assert.ok(html.includes("I was at the &lt;dentist&gt;"));
  assert.ok(html.includes('href="https://p.example/attendance"'));
});

test("attendanceChangedEmail: old → new status; appeal link only when changed to Absent", () => {
  const up = attendanceChangedEmail({ ...base, from: "ABSENT", to: "PRESENT" });
  assert.equal(up.subject, "Attendance updated: Fall Rehearsal — Sat, Oct 3 at 6:00 PM");
  assert.ok(up.html.includes("from <strong>Absent</strong> to <strong>Present</strong>"));
  assert.ok(!up.html.includes("Appeal this absence"));
  const down = attendanceChangedEmail({ ...base, from: "PRESENT", to: "ABSENT", appealUrl: "https://p.example/appeal/t" });
  assert.ok(down.html.includes("to <strong>Absent</strong>"));
  assert.ok(down.html.includes('href="https://p.example/appeal/t"'));
  assert.ok(down.html.includes("Attendance is mandatory"));
});
