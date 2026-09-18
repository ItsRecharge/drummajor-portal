import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conflictPolicyHtml,
  conflictMailto,
  eventCreatedEmail,
  eventReminderEmail,
  monthlyDigestEmail,
  type ConflictPolicy,
} from "../src/lib/event-emails.ts";

const policy: ConflictPolicy = {
  contactName: "Mr. Costello",
  contactEmail: "costello@winchesterps.org",
  ccName: "Jake Killian",
  ccEmail: "jkillian@wpsstudent.com",
};
const namesOnly: ConflictPolicy = { contactName: "Mr. Costello", ccName: "Jake Killian" };

const base = {
  title: "Fall Rehearsal <#2>",
  when: "Sat, Oct 3 at 6:00 PM",
  location: "Stadium",
  description: "Full uniform",
  calendarUrl: "https://portal.example.com/calendar",
  policy,
  bandName: "Winchester Band",
};

test("conflictMailto prefills to, cc and subject; null without a contact email", () => {
  const href = conflictMailto(policy, "Fall Rehearsal");
  assert.equal(
    href,
    "mailto:costello@winchesterps.org?cc=jkillian%40wpsstudent.com&subject=Conflict%3A%20Fall%20Rehearsal",
  );
  assert.equal(conflictMailto(namesOnly, "x"), null);
  assert.equal(conflictMailto({ ...policy, ccEmail: null }, "x"), "mailto:costello@winchesterps.org?subject=Conflict%3A%20x");
});

test("conflictPolicyHtml carries the policy text and links names when emails are set", () => {
  const html = conflictPolicyHtml(policy, "Fall Rehearsal");
  assert.ok(html.includes("Attendance is mandatory"));
  assert.ok(html.includes("may impact your grade"));
  assert.ok(html.includes("cleared at least 3 days ahead"));
  assert.ok(html.includes("a cut will be recorded"));
  assert.ok(html.includes('href="mailto:costello@winchesterps.org?cc=jkillian%40wpsstudent.com'));
  assert.ok(html.includes(">Mr. Costello</a>"));
  assert.ok(html.includes("CC"));
  assert.ok(html.includes("Jake Killian"));
  const plain = conflictPolicyHtml(namesOnly, "Fall Rehearsal");
  assert.ok(!plain.includes("mailto:"));
  assert.ok(plain.includes("Mr. Costello") && plain.includes("Jake Killian"));
  // No drum major picked yet: the sentence just names the contact.
  const noCc = conflictPolicyHtml({ contactName: "Mr. Costello", contactEmail: "c@x.org" }, "Fall Rehearsal");
  assert.ok(noCc.includes("email <a href=\"mailto:c@x.org?subject=Conflict%3A%20Fall%20Rehearsal\""));
  assert.ok(!noCc.includes("CC"));
});

test("eventCreatedEmail: subject, escaped title, details, policy, calendar link", () => {
  const { subject, html } = eventCreatedEmail(base);
  assert.equal(subject, "New band event: Fall Rehearsal <#2> — Sat, Oct 3 at 6:00 PM");
  assert.ok(html.includes("Fall Rehearsal &lt;#2&gt;"));
  assert.ok(!html.includes("<#2>"));
  assert.ok(html.includes("Stadium") && html.includes("Full uniform"));
  assert.ok(html.includes("Attendance is mandatory"));
  assert.ok(html.includes('href="https://portal.example.com/calendar"'));
  assert.ok(html.includes("Winchester Band"));
});

test("eventReminderEmail: distinct subjects per kind, 3-day one names the deadline", () => {
  assert.equal(eventReminderEmail("WEEK_BEFORE", base).subject, "One week out: Fall Rehearsal <#2> — Sat, Oct 3 at 6:00 PM");
  assert.equal(eventReminderEmail("THREE_DAYS_BEFORE", base).subject, "3 days out: Fall Rehearsal <#2> — Sat, Oct 3 at 6:00 PM");
  assert.equal(eventReminderEmail("DAY_OF", base).subject, "Today: Fall Rehearsal <#2> — Sat, Oct 3 at 6:00 PM");
  const three = eventReminderEmail("THREE_DAYS_BEFORE", base).html;
  assert.ok(three.includes("Today is the last day"));
  assert.ok(eventReminderEmail("DAY_OF", base).html.includes("Attendance is mandatory"));
});

test("monthlyDigestEmail lists every event with when/where and the policy", () => {
  const { subject, html } = monthlyDigestEmail({
    monthLabel: "October",
    events: [
      { title: "Fall Rehearsal", when: "Sat, Oct 3 at 6:00 PM", location: "Stadium" },
      { title: "Homecoming <Game>", when: "Fri, Oct 16 at 7:00 PM", location: null },
    ],
    calendarUrl: base.calendarUrl,
    policy,
    bandName: "Winchester Band",
  });
  assert.equal(subject, "October band events — Winchester Band");
  assert.ok(html.includes("Fall Rehearsal") && html.includes("Stadium"));
  assert.ok(html.includes("Homecoming &lt;Game&gt;"));
  assert.ok(html.includes("Attendance is mandatory"));
  assert.ok(html.includes(base.calendarUrl));
});
