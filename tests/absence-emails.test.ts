import { test } from "node:test";
import assert from "node:assert/strict";
import { absenceEmail, appealDecisionEmail, appealSubmittedEmail } from "../src/lib/absence-emails.ts";
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
