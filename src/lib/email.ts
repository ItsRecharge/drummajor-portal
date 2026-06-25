import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto";

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
}): string {
  const links = opts.linksHtml
    ? `<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0" /><p style="font-weight:600;margin:0 0 8px">Attached music</p>${opts.linksHtml}`
    : "";
  const pixel = `<img src="${opts.pixelUrl}" width="1" height="1" alt="" style="display:none" />`;
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#171717">
    ${opts.bodyHtml}
    ${links}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0" />
    <p style="font-size:12px;color:#737373">Sent via the Drum Major Portal</p>
    ${pixel}
  </div>`;
}

// Sends with the saved config. Throws if SMTP isn't configured yet.
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
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

// ---- Templates -------------------------------------------------------------

function layout(heading: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#171717">
    <h2 style="margin:0 0 16px">${heading}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0" />
    <p style="font-size:12px;color:#737373">Drum Major Portal</p>
  </div>`;
}

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">${label}</a></p>
    <p style="font-size:12px;color:#737373">Or paste this link: ${href}</p>`;
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
