// Email templates for band events: created-within-a-week, the three reminders,
// and the monthly overview. Pure (built on email-layout) so they're testable.
import { button, escapeText, headingHtml, meta, note, shell } from "./email-layout.ts";
import type { ReminderKind } from "./event-schedule.ts";

// Who a student must email about a conflict. Names always render; the mailto
// link appears only once the admin has entered addresses in Settings.
export type ConflictPolicy = {
  contactName: string;
  contactEmail?: string | null;
  ccName: string;
  ccEmail?: string | null;
};

export const DEFAULT_CONTACT_NAME = "Mr. Costello";
export const DEFAULT_CC_NAME = "Jake Killian";

// `body` is the inner HTML (heading + content) for the announcement queue,
// which adds the shell and tracking pixel at send time; `html` is the fully
// wrapped message for direct sends.
export type EventMail = { subject: string; body: string; html: string };

function compose(subject: string, heading: string, content: string, bandName?: string): EventMail {
  const body = `${headingHtml(heading)}${content}`;
  return { subject, body, html: shell(body, bandName) };
}

export type EventEmailInput = {
  title: string;
  when: string;
  location?: string | null;
  description?: string | null;
  calendarUrl: string;
  policy: ConflictPolicy;
  bandName?: string;
};

export function conflictMailto(policy: ConflictPolicy, eventTitle: string): string | null {
  if (!policy.contactEmail) return null;
  const params = new URLSearchParams();
  if (policy.ccEmail) params.set("cc", policy.ccEmail);
  params.set("subject", `Conflict: ${eventTitle}`);
  return `mailto:${policy.contactEmail}?${params.toString().replace(/\+/g, "%20")}`;
}

function person(name: string, email: string | null | undefined, href: string | null): string {
  const label = escapeText(name);
  if (href) return `<a href="${href}" style="font-weight:600">${label}</a>`;
  if (email) return `<a href="mailto:${escapeText(email)}" style="font-weight:600">${label}</a>`;
  return `<strong>${label}</strong>`;
}

export function conflictPolicyHtml(policy: ConflictPolicy, eventTitle: string): string {
  const contact = person(policy.contactName, policy.contactEmail, conflictMailto(policy, eventTitle));
  const cc = person(policy.ccName, policy.ccEmail, null);
  return note(
    `<strong>Attendance is mandatory</strong> and may impact your grade. If you cannot make it, email ${contact} and CC ${cc}. ` +
      `Unless it is a genuine emergency, every conflict must be cleared at least 3 days ahead of time or a cut will be recorded.`,
  );
}

function details(input: EventEmailInput): string {
  return (
    meta([
      ["What", input.title],
      ["When", input.when],
      ["Where", input.location],
    ]) + (input.description ? `<p style="white-space:pre-wrap">${escapeText(input.description)}</p>` : "")
  );
}

function calendarButton(url: string): string {
  return button(url, "See the full calendar");
}

export function eventCreatedEmail(input: EventEmailInput): EventMail {
  return compose(
    `New band event: ${input.title} — ${input.when}`,
    "New band event",
    `<p>A band event has been added for this week.</p>${details(input)}${conflictPolicyHtml(input.policy, input.title)}${calendarButton(input.calendarUrl)}`,
    input.bandName,
  );
}

const REMINDER_COPY: Record<ReminderKind, { prefix: string; heading: string; lead: string }> = {
  WEEK_BEFORE: {
    prefix: "One week out",
    heading: "One week to go",
    lead: "Heads up: this is one week away. Check your calendar now so any conflict can be cleared in time.",
  },
  THREE_DAYS_BEFORE: {
    prefix: "3 days out",
    heading: "Three days to go",
    lead: "Today is the last day to report a conflict without a cut being recorded.",
  },
  DAY_OF: {
    prefix: "Today",
    heading: "Today",
    lead: "See you there. Be early, be in the right gear, and bring what the details below ask for.",
  },
};

export function eventReminderEmail(kind: ReminderKind, input: EventEmailInput): EventMail {
  const copy = REMINDER_COPY[kind];
  return compose(
    `${copy.prefix}: ${input.title} — ${input.when}`,
    copy.heading,
    `<p>${copy.lead}</p>${details(input)}${conflictPolicyHtml(input.policy, input.title)}${calendarButton(input.calendarUrl)}`,
    input.bandName,
  );
}

export type DigestEvent = { title: string; when: string; location?: string | null };

export function monthlyDigestEmail(opts: {
  monthLabel: string;
  events: DigestEvent[];
  calendarUrl: string;
  policy: ConflictPolicy;
  bandName?: string;
}): EventMail {
  const items = opts.events
    .map(
      (e) =>
        `<li style="margin:0 0 10px"><strong>${escapeText(e.title)}</strong><br /><span style="font-size:14px">${escapeText(e.when)}${e.location ? ` · ${escapeText(e.location)}` : ""}</span></li>`,
    )
    .join("");
  const band = opts.bandName ? ` — ${opts.bandName}` : "";
  return compose(
    `${opts.monthLabel} band events${band}`,
    `${escapeText(opts.monthLabel)} at a glance`,
    `<p>Here is everything on the band calendar this month. Each event also gets a reminder a week out, three days out, and the morning of.</p><ul style="padding-left:20px;margin:12px 0">${items}</ul>${conflictPolicyHtml(opts.policy, `${opts.monthLabel} events`)}${calendarButton(opts.calendarUrl)}`,
    opts.bandName,
  );
}
