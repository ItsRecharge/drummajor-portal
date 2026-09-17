import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto";
import { BRAND, button, escapeText, layout, meta, shell } from "@/lib/email-layout";

// Nodemailer over Gmail SMTP. The config (host/port/band-email/app-password) is
// captured in the first-run wizard and stored encrypted in AppSettings.smtpConfigEnc.

export type SmtpConfig = {
  host: string;
  port: number;
  user: string; // band email address
  appPassword: string;
  fromName?: string;
};

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.appSettings.findFirst();
  if (!settings?.smtpConfigEnc) return null;
  return decryptJson<SmtpConfig>(settings.smtpConfigEnc);
}

export function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.appPassword },
  });
}

export function fromHeader(cfg: SmtpConfig): string {
  return `"${cfg.fromName ?? "Drum Major Portal"}" <${cfg.user}>`;
}

// Wraps a (sanitized) announcement body for sending: optional attached-music links
// block, plus the per-recipient invisible tracking pixel that drives open counts.
export function announcementEmail(opts: {
  bodyHtml: string;
  pixelUrl: string;
  linksHtml?: string;
  bandName?: string;
}): string {
  const links = opts.linksHtml
    ? `<hr style="border:none;border-top:1px solid ${BRAND.rule};margin:20px 0" /><p style="font-weight:600;margin:0 0 8px">🎵 Music</p>${opts.linksHtml}`
    : "";
  const pixel = `<img src="${opts.pixelUrl}" width="1" height="1" alt="" style="display:none" />`;
  return shell(`${opts.bodyHtml}${links}${pixel}`, opts.bandName);
}

// Sends with the saved config. Throws if SMTP isn't configured yet.
export type MailAttachment = { filename: string; content: Buffer | string; contentType?: string };

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
  // Calendar invite (nodemailer renders it as a text/calendar alternative).
  icalEvent?: { method: string; content: string };
}): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg) throw new Error("SMTP is not configured");
  const transport = buildTransport(cfg);
  await transport.sendMail({ from: fromHeader(cfg), ...opts });
}

// Tests an UNSAVED config (the wizard "send test email" button) so the user can
// confirm credentials before we persist them.
export async function sendTestEmail(cfg: SmtpConfig, to: string): Promise<void> {
  const transport = buildTransport(cfg);
  await transport.sendMail({
    from: fromHeader(cfg),
    to,
    subject: "Drum Major Portal — test email",
    html: layout(
      "SMTP is working",
      `<p>This is a test message from the Drum Major Portal setup wizard. If you received it, your email settings are correct.</p>`,
    ),
  });
}

// --- Leadership notifications (drum majors + admins) ------------------------

export function taskCreatedEmail(opts: {
  title: string;
  creatorName: string;
  assigneeName?: string | null;
  bandName?: string;
}) {
  const href = `${appBaseUrl()}/tasks`;
  return {
    subject: `New task: ${opts.title}`,
    html: layout(
      "New task",
      `<p><strong>${escapeText(opts.creatorName)}</strong> added a task.</p>${meta([
        ["Task", opts.title],
        ["Assigned to", opts.assigneeName ?? "Unassigned — grab it if you can"],
      ])}${button(href, "Open tasks")}`,
      opts.bandName,
    ),
  };
}

export function ideaCreatedEmail(opts: { preview: string; authorName: string | null; bandName?: string }) {
  const href = `${appBaseUrl()}/notes`;
  const who = opts.authorName ? `<strong>${escapeText(opts.authorName)}</strong> posted` : "Someone posted";
  return {
    subject: `New idea: ${opts.preview.slice(0, 60)}`,
    html: layout(
      "New idea on the board",
      `<p>${who} a new idea:</p><blockquote style="margin:8px 0 12px;padding:10px 14px;border-left:3px solid ${BRAND.red};background:${BRAND.paper};border-radius:0 6px 6px 0">${escapeText(opts.preview)}</blockquote>${button(href, "See the board")}`,
      opts.bandName,
    ),
  };
}

export function dmEventEmail(opts: {
  title: string;
  when: string;
  location?: string | null;
  description?: string | null;
  creatorName: string;
  bandName?: string;
}) {
  const href = `${appBaseUrl()}/dm-events`;
  return {
    subject: `Drum major event: ${opts.title} — ${opts.when}`,
    html: layout(
      "Drum major event",
      `<p><strong>${escapeText(opts.creatorName)}</strong> added an event for the drum majors. A calendar invite is attached.</p>${meta([
        ["What", opts.title],
        ["When", opts.when],
        ["Where", opts.location],
      ])}${opts.description ? `<p style="white-space:pre-wrap">${escapeText(opts.description)}</p>` : ""}${button(href, "View drum major events")}`,
      opts.bandName,
    ),
  };
}

export function inviteEmail(inviterName: string, token: string) {
  const href = `${appBaseUrl()}/invite/${token}`;
  return {
    subject: `${inviterName} invited you to the Drum Major Portal`,
    html: layout(
      "You've been invited",
      `<p>${inviterName} invited you to join the Drum Major Portal. Click below to set up your account.</p>${button(href, "Accept invite")}`,
    ),
  };
}

export function verificationEmail(token: string) {
  const href = `${appBaseUrl()}/verify-email/${token}`;
  return {
    subject: "Verify your email — Drum Major Portal",
    html: layout(
      "Verify your email",
      `<p>Confirm this email address to finish setting up your account.</p>${button(href, "Verify email")}`,
    ),
  };
}

export function passwordResetEmail(token: string) {
  const href = `${appBaseUrl()}/reset-password/${token}`;
  return {
    subject: "Reset your password — Drum Major Portal",
    html: layout(
      "Reset your password",
      `<p>We received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, ignore this email.</p>${button(href, "Reset password")}`,
    ),
  };
}
