import { prisma } from "@/lib/prisma";
import { AnnouncementStatus } from "@/generated/prisma/client";
import { getSmtpConfig, buildTransport, fromHeader, announcementEmail, appBaseUrl } from "@/lib/email";
import { randomToken, isExpired } from "@/lib/tokens";
import { resolveGroupMemberIds } from "@/lib/groups";
import { getFileBuffer, shareAnyoneWithLink, isDriveConfigured } from "@/lib/drive";

// Gmail rejects single messages over ~25MB; above that we link instead of attach.
const GMAIL_ATTACH_LIMIT = 25 * 1024 * 1024;
// How many recipients to send per scheduler tick. With a 1-minute tick this paces
// delivery (a full ~150-person send finishes over a few minutes) and stays well
// under Gmail's per-message throttling.
const BATCH_PER_TICK = 40;
// Small delay between messages within a tick — "a few per second".
const SEND_SPACING_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Unique, lowercased recipient emails across the announcement's selected groups.
export async function resolveRecipients(announcementId: string): Promise<string[]> {
  const links = await prisma.announcementRecipientGroup.findMany({
    where: { announcementId },
    include: { group: true },
  });
  const ids = new Set<string>();
  for (const link of links) {
    for (const cid of await resolveGroupMemberIds(link.group)) ids.add(cid);
  }
  if (ids.size === 0) return [];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: [...ids] } },
    select: { email: true },
  });
  return [...new Set(contacts.map((c) => c.email.toLowerCase()))];
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

// For each attached piece's files: small ones ride along as Gmail attachments;
// large ones become shared Drive links. No-ops cleanly when Drive isn't configured.
async function buildMusicAttachments(announcementId: string): Promise<MusicAttachments> {
  const links = await prisma.announcementMusic.findMany({
    where: { announcementId },
    include: { musicPiece: { include: { files: true } } },
  });
  const result: MusicAttachments = { files: [], linksHtml: "" };
  if (links.length === 0 || !(await isDriveConfigured())) return result;

  const linkItems: string[] = [];
  for (const { musicPiece } of links) {
    for (const file of musicPiece.files) {
      const small = file.sizeBytes != null && Number(file.sizeBytes) < GMAIL_ATTACH_LIMIT;
      try {
        if (small) {
          const { buffer } = await getFileBuffer(file.driveFileId);
          result.files.push({ filename: file.filename, content: buffer });
        } else {
          const url = await shareAnyoneWithLink(file.driveFileId);
          linkItems.push(
            `<li><a href="${url}">${musicPiece.title} — ${file.filename}</a></li>`,
          );
        }
      } catch {
        // Skip a file we can't fetch/share rather than failing the whole send.
      }
    }
  }
  if (linkItems.length > 0) result.linksHtml = `<ul>${linkItems.join("")}</ul>`;
  return result;
}

// Idempotent, restart-safe queue worker. Promotes due scheduled announcements,
// then sends a throttled batch of unsent deliveries for each SENDING announcement,
// marking the announcement SENT once every delivery has been attempted.
export async function processQueue(): Promise<void> {
  const now = new Date();

  await prisma.announcement.updateMany({
    where: { status: AnnouncementStatus.SCHEDULED, scheduledAt: { lte: now } },
    data: { status: AnnouncementStatus.SENDING },
  });

  const sending = await prisma.announcement.findMany({
    where: { status: AnnouncementStatus.SENDING },
  });
  if (sending.length === 0) return;

  const cfg = await getSmtpConfig();

  for (const ann of sending) {
    const pending = await prisma.emailDelivery.findMany({
      where: { announcementId: ann.id, sentAt: null, error: null },
      take: BATCH_PER_TICK,
    });

    if (pending.length === 0) {
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

    // Can't send without SMTP — leave deliveries pending for a later tick.
    if (!cfg) continue;

    const transport = buildTransport(cfg);
    const music = await buildMusicAttachments(ann.id);

    for (const d of pending) {
      try {
        const html = announcementEmail({
          bodyHtml: ann.bodyHtml,
          pixelUrl: `${appBaseUrl()}/t/${d.trackingToken}.gif`,
          linksHtml: music.linksHtml,
        });
        await transport.sendMail({
          from: fromHeader(cfg),
          to: d.recipientEmail,
          subject: ann.subject,
          html,
          attachments: music.files,
        });
        await prisma.emailDelivery.update({ where: { id: d.id }, data: { sentAt: new Date() } });
      } catch (err) {
        await prisma.emailDelivery.update({
          where: { id: d.id },
          data: { error: (err as Error).message.slice(0, 500) },
        });
      }
      await sleep(SEND_SPACING_MS);
    }
  }
}
