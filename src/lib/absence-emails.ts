// Emails around a recorded absence: the notice to the student (with their
// personal appeal link), the decision, and the heads-up to leadership. Pure.
import { button, escapeText, headingHtml, shell } from "./email-layout.ts";
import { conflictPolicyHtml, type ConflictPolicy, type EventMail } from "./event-emails.ts";

function compose(subject: string, heading: string, content: string, bandName?: string): EventMail {
  const body = `${headingHtml(heading)}${content}`;
  return { subject, body, html: shell(body, bandName) };
}

type AbsenceBase = { studentName: string; title: string; when: string; policy: ConflictPolicy; bandName?: string };

export function absenceEmail(opts: AbsenceBase & { appealUrl: string }): EventMail {
  return compose(
    `Marked absent: ${opts.title} — ${opts.when}`,
    "You were marked absent",
    `<p>Hi ${escapeText(opts.studentName)}, you were marked <strong>absent</strong> from <strong>${escapeText(opts.title)}</strong> (${escapeText(opts.when)}).</p>` +
      conflictPolicyHtml(opts.policy, opts.title) +
      `<p style="margin-top:16px">If this absence was excused — or you were there — and it wasn't recorded correctly, appeal it and a drum major will review it:</p>` +
      button(opts.appealUrl, "Appeal this absence") +
      `<p style="font-size:12px;margin-top:12px">This link is personal to you. It stays valid until the absence is cleared.</p>`,
    opts.bandName,
  );
}

export function appealDecisionEmail(opts: AbsenceBase & { approved: boolean }): EventMail {
  const contact = escapeText(opts.policy.contactName);
  return opts.approved
    ? compose(
        `Absence excused: ${opts.title}`,
        "Your appeal was approved",
        `<p>Hi ${escapeText(opts.studentName)}, your absence from <strong>${escapeText(opts.title)}</strong> (${escapeText(opts.when)}) is now recorded as <strong>Excused</strong>.</p>`,
        opts.bandName,
      )
    : compose(
        `Appeal not approved: ${opts.title}`,
        "Your appeal was not approved",
        `<p>Hi ${escapeText(opts.studentName)}, your absence from <strong>${escapeText(opts.title)}</strong> (${escapeText(opts.when)}) stays recorded as absent.</p>` +
          `<p>If you think that's wrong, talk to ${contact} directly.</p>` +
          conflictPolicyHtml(opts.policy, opts.title),
        opts.bandName,
      );
}

export function appealSubmittedEmail(opts: AbsenceBase & { reason: string; reviewUrl: string }): EventMail {
  return compose(
    `Absence appeal: ${opts.studentName} — ${opts.title}`,
    "New absence appeal",
    `<p><strong>${escapeText(opts.studentName)}</strong> is appealing their absence from <strong>${escapeText(opts.title)}</strong> (${escapeText(opts.when)}):</p>` +
      `<blockquote style="margin:8px 0 12px;padding:10px 14px;border-left:3px solid #b3122b;background:#faf8f5;border-radius:0 6px 6px 0;white-space:pre-wrap">${escapeText(opts.reason)}</blockquote>` +
      button(opts.reviewUrl, "Review appeals"),
    opts.bandName,
  );
}
