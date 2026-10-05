import { prisma } from "@/lib/prisma";
import { AnnouncementStatus } from "@/generated/prisma/client";
import { getSmtpConfig, buildBatchTransport, fromHeader, announcementEmail, appBaseUrl } from "@/lib/email";
import { randomToken, isExpired } from "@/lib/tokens";
import { resolveGroupMemberIds } from "@/lib/groups";
import { getLeadershipEmails } from "@/lib/leadership";
import { shareAnyoneWithLink, isDriveConfigured } from "@/lib/drive";
import { absolutizeImageSrc, escapeHtml, keepBlankLines } from "@/lib/sanitize";

import { MAIL_BATCH_SIZE, MAIL_SPACING_MS, MAX_ATTEMPTS, isTransientSmtpError, retryDelayMs } from "@/lib/mail-retry";

// The cron tick fires every minute even if the last batch is still going; the
// flag (on globalThis so separate server bundles share it) keeps ticks from
// overlapping, which would send the same rows twice over two Gmail logins.
const lock = globalThis as unknown as { __dmpQueueRunning?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Unique, lowercased recipient emails: the announcement's selected groups plus
// every drum major / admin.
export async function resolveRecipients(announcementId: string): Promise<string[]> {
  const links = await prisma.announcementRecipientGroup.findMany({
    where: { announcementId },
    include: { group: true },
  });
  const ids = new Set<string>();
  for (const link of links) {
    for (const cid of await resolveGroupMemberIds(link.group)) ids.add(cid);
  }
  // Every send also goes to the leadership team (drum majors + admins). A
  // leader who is also on a roster is emailed once: the Set dedupes by email.
  const emails = new Set(await getLeadershipEmails());
  if (ids.size > 0) {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: [...ids] } },
      select: { email: true },
    });
    for (const c of contacts) emails.add(c.email.toLowerCase());
  }
  return [...emails];
}

// Materialize one EmailDelivery per unique recipient (idempotent — skips if the
// announcement already has deliveries) and move it into the right state:
// PENDING_APPROVAL when the org requires approval, SCHEDULED when future-dated,
// otherwise SENDING. The scheduler does the actual sending.
export async function enqueueAnnouncement(
  announcementId: string,
  opts: { scheduledAt?: Date | null } = {},
): Promise<{ recipients: number }> {
  const existing = await prisma.emailDelivery.count({ where: { announcementId } });
  if (existing === 0) {
    const emails = await resolveRecipients(announcementId);
    if (emails.length > 0) {
      await prisma.emailDelivery.createMany({
        data: emails.map((email) => ({
          announcementId,
          recipientEmail: email,
          trackingToken: randomToken(),
        })),
      });
    }
  }
  const count = await prisma.emailDelivery.count({ where: { announcementId } });

  const settings = await prisma.appSettings.findFirst({ select: { approvalRequired: true } });
  const scheduledFuture = opts.scheduledAt && !isExpired(opts.scheduledAt);
  const status = settings?.approvalRequired
    ? AnnouncementStatus.PENDING_APPROVAL
    : scheduledFuture
      ? AnnouncementStatus.SCHEDULED
      : AnnouncementStatus.SENDING;

  await prisma.announcement.update({
    where: { id: announcementId },
    data: { status, scheduledAt: opts.scheduledAt ?? null },
  });
  return { recipients: count };
}

// Admin release of a PENDING_APPROVAL announcement → SCHEDULED (if future) or SENDING.
export async function approveAnnouncement(announcementId: string): Promise<void> {
  const ann = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!ann || ann.status !== AnnouncementStatus.PENDING_APPROVAL) return;
  const scheduledFuture = ann.scheduledAt && !isExpired(ann.scheduledAt);
  await prisma.announcement.update({
    where: { id: announcementId },
    data: { status: scheduledFuture ? AnnouncementStatus.SCHEDULED : AnnouncementStatus.SENDING },
  });
}

type MusicAttachments = {
  files: { filename: string; content: Buffer }[];
  linksHtml: string;
};

// Each attached Library item (usually a folder of music) becomes a shared Drive
// link in the email. No-ops cleanly when Drive isn't configured.
async function buildMusicAttachments(announcementId: string): Promise<MusicAttachments> {
  const links = await prisma.announcementMusic.findMany({
    where: { announcementId },
    include: { libraryItem: { select: { name: true, driveId: true, webViewLink: true } } },
  });
  const result: MusicAttachments = { files: [], linksHtml: "" };
  if (links.length === 0 || !(await isDriveConfigured())) return result;

  const linkItems: string[] = [];
  for (const { libraryItem } of links) {
    if (!libraryItem.driveId) continue;
    try {
      const url = libraryItem.webViewLink ?? (await shareAnyoneWithLink(libraryItem.driveId));
      linkItems.push(`<li><a href="${escapeHtml(url)}">${escapeHtml(libraryItem.name)}</a></li>`);
    } catch {
      // Skip an item we can't share rather than failing the whole send.
    }
  }
  if (linkItems.length > 0) result.linksHtml = `<ul>${linkItems.join("")}</ul>`;
  return result;
}

// Idempotent, restart-safe queue worker. Promotes due scheduled announcements,
// then sends one batch (MAIL_BATCH_SIZE across all announcements) of due
// deliveries, marking an announcement SENT once every delivery has been sent or
// has failed for good. A temporary SMTP error (Gmail throttling) reschedules
// that delivery with backoff and ends the tick, so the rest wait instead of failing.
export async function processQueue(): Promise<void> {
  if (lock.__dmpQueueRunning) return;
  lock.__dmpQueueRunning = true;
  try {
    await runQueue();
  } finally {
    lock.__dmpQueueRunning = false;
  }
}

async function runQueue(): Promise<void> {
  const now = new Date();

  await prisma.announcement.updateMany({
    where: { status: AnnouncementStatus.SCHEDULED, scheduledAt: { lte: now } },
    data: { status: AnnouncementStatus.SENDING },
  });

  const sending = await prisma.announcement.findMany({
    where: { status: AnnouncementStatus.SENDING },
    orderBy: { createdAt: "asc" },
  });
  if (sending.length === 0) return;

  const cfg = await getSmtpConfig();
  // One connection (one Gmail login) per tick, shared by every announcement.
  const transport = cfg ? buildBatchTransport(cfg) : null;
  let budget = MAIL_BATCH_SIZE;

  try {
    for (const ann of sending) {
      const unfinished = await prisma.emailDelivery.count({
        where: { announcementId: ann.id, sentAt: null, error: null },
      });

      if (unfinished === 0) {
        const failures = await prisma.emailDelivery.count({
          where: { announcementId: ann.id, error: { not: null } },
        });
        const total = await prisma.emailDelivery.count({ where: { announcementId: ann.id } });
        await prisma.announcement.update({
          where: { id: ann.id },
          data: {
            status: failures === total && total > 0 ? AnnouncementStatus.FAILED : AnnouncementStatus.SENT,
            sentAt: ann.sentAt ?? new Date(),
          },
        });
        continue;
      }

      // Can't send without SMTP, or this tick's batch is used up — later tick.
      if (!cfg || !transport || budget <= 0) continue;

      const due = await prisma.emailDelivery.findMany({
        where: {
          announcementId: ann.id,
          sentAt: null,
          error: null,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        orderBy: { id: "asc" },
        take: budget,
      });
      if (due.length === 0) continue;

      const music = await buildMusicAttachments(ann.id);
      const org = await prisma.organization.findFirst({ select: { bandName: true } });
      const bodyHtml = absolutizeImageSrc(keepBlankLines(ann.bodyHtml), appBaseUrl());

      for (const d of due) {
        budget--;
        try {
          await transport.sendMail({
            from: fromHeader(cfg),
            to: d.recipientEmail,
            subject: ann.subject,
            html: announcementEmail({
              bodyHtml,
              pixelUrl: `${appBaseUrl()}/t/${d.trackingToken}.gif`,
              linksHtml: music.linksHtml,
              bandName: org?.bandName,
            }),
            attachments: music.files,
          });
          await prisma.emailDelivery.update({ where: { id: d.id }, data: { sentAt: new Date() } });
        } catch (err) {
          const attempts = d.attempts + 1;
          const message = (err as Error).message.slice(0, 500);
          if (isTransientSmtpError(err) && attempts < MAX_ATTEMPTS) {
            await prisma.emailDelivery.update({
              where: { id: d.id },
              data: { attempts, nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)) },
            });
            console.warn(`[announce] ${d.recipientEmail}: temporary error (try ${attempts}), retrying later: ${message}`);
            return; // Gmail is pushing back — stop this tick, resume next minute.
          }
          await prisma.emailDelivery.update({ where: { id: d.id }, data: { attempts, error: message } });
        }
        await sleep(MAIL_SPACING_MS);
      }
    }
  } finally {
    transport?.close();
  }
}
