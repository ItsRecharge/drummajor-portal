// Prisma-facing side of event emails. The rules (which day it is for the band,
// what's due) live in ./event-schedule.ts and the copy in ./event-emails.ts;
// this file turns them into queued announcements to the event's class list.
// Leadership is cc'd automatically by the announcement queue.
import { prisma } from "@/lib/prisma";
import { enqueueAnnouncement } from "@/lib/announce";
import { notifyAll } from "@/lib/notify";
import { appBaseUrl } from "@/lib/email";
import { getBandName } from "@/lib/leadership";
import { ensureBuiltInGroups, EVERYONE } from "@/lib/groups";
import { EventAudience, Role, type Event, type EventNoticeKind } from "@/generated/prisma/client";
import {
  DEFAULT_TZ,
  calendarDayInZone,
  coveredKinds,
  daysUntil,
  digestSelection,
  dueReminder,
  monthKey,
  shouldAnnounceOnCreate,
  todayUtcInZone,
  type NoticeKind,
} from "@/lib/event-schedule";
import {
  eventCreatedEmail,
  eventReminderEmail,
  monthlyDigestEmail,
  type EventMail,
} from "@/lib/event-emails";
import { formatEventWhen } from "@/app/(app)/events/event-dates";
import { getConflictPolicy } from "@/lib/attendance-policy";

const DAY_MS = 86_400_000;

export function publicCalendarUrl(): string {
  return `${appBaseUrl()}/calendar`;
}

// Announcements need an author. Scheduled sends fall back to the first admin.
async function fallbackAuthorId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

async function everyoneGroupId(): Promise<string | null> {
  await ensureBuiltInGroups();
  const g = await prisma.group.findUnique({ where: { name: EVERYONE }, select: { id: true } });
  return g?.id ?? null;
}

// Create + queue an announcement to one group. Returns the announcement id.
async function queueAnnouncement(mail: EventMail, authorId: string, groupId: string): Promise<string> {
  const announcement = await prisma.announcement.create({
    data: { subject: mail.subject, bodyHtml: mail.body, authorId },
  });
  await prisma.announcementRecipientGroup.create({ data: { announcementId: announcement.id, groupId } });
  await enqueueAnnouncement(announcement.id, {});
  return announcement.id;
}

async function eventMailInput(event: Event) {
  const [policy, bandName] = await Promise.all([getConflictPolicy(), getBandName()]);
  return {
    title: event.title,
    when: formatEventWhen(event.date, event.time),
    location: event.location,
    description: event.description,
    calendarUrl: publicCalendarUrl(),
    policy,
    bandName,
  };
}

// Send one email about an event to its expected class list and record every
// notice kind it covers (so later reminders know they're done).
export async function sendEventEmail(
  event: Event,
  notice: { send: NoticeKind; record: NoticeKind[] },
): Promise<string | null> {
  const authorId = event.createdById ?? (await fallbackAuthorId());
  const groupId = event.attendanceGroupId ?? (await everyoneGroupId());
  if (!authorId || !groupId) return null;

  const input = await eventMailInput(event);
  const mail = notice.send === "ANNOUNCED" ? eventCreatedEmail(input) : eventReminderEmail(notice.send, input);
  const announcementId = await queueAnnouncement(mail, authorId, groupId);
  await prisma.eventNotice.createMany({
    data: notice.record.map((kind) => ({
      eventId: event.id,
      kind: kind as EventNoticeKind,
      announcementId: kind === notice.send ? announcementId : null,
    })),
    skipDuplicates: true,
  });
  return announcementId;
}

// On creation: email the class list now only if the event is within a week.
// That email stands in for any reminder that would already have gone out.
export async function announceEventIfSoon(event: Event, now = new Date()): Promise<boolean> {
  const days = daysUntil(event.date, now);
  if (!shouldAnnounceOnCreate(days)) return false;
  const id = await sendEventEmail(event, { send: "ANNOUNCED", record: ["ANNOUNCED", ...coveredKinds(days)] });
  if (!id) return false;
  await prisma.event.update({ where: { id: event.id }, data: { notify: true } });
  await notifyAll("EVENT", { title: event.title, when: formatEventWhen(event.date, event.time) }, event.createdById ?? undefined);
  return true;
}

// Reminders for every band event in the next week. At most one email per
// event per day; a day the server missed is caught up the next morning.
export async function sendDueReminders(now = new Date()): Promise<number> {
  const today = todayUtcInZone(now);
  const horizon = new Date(today.getTime() + 7 * DAY_MS);
  const events = await prisma.event.findMany({
    where: { audience: EventAudience.BAND, date: { gte: today, lte: horizon } },
    include: { notices: { select: { kind: true } } },
    orderBy: { date: "asc" },
  });
  let sent = 0;
  for (const event of events) {
    const due = dueReminder(daysUntil(event.date, now), event.notices.map((n) => n.kind as NoticeKind));
    if (!due) continue;
    try {
      if (await sendEventEmail(event, due)) sent++;
    } catch (err) {
      console.error(`[event-comms] reminder for "${event.title}" failed:`, err);
    }
  }
  return sent;
}

// Once per calendar month: an overview of the month's remaining band events,
// sent only when at least one is more than a week away.
export async function sendMonthlyDigestIfDue(now = new Date()): Promise<boolean> {
  const period = monthKey(now);
  if (await prisma.digestLog.findUnique({ where: { period } })) return false;

  const { year, month } = calendarDayInZone(now);
  const events = await prisma.event.findMany({
    where: {
      audience: EventAudience.BAND,
      date: { gte: new Date(Date.UTC(year, month, 1)), lt: new Date(Date.UTC(year, month + 1, 1)) },
    },
    orderBy: { date: "asc" },
  });
  const selection = digestSelection(events, now);
  if (!selection.shouldSend) return false;

  const [authorId, groupId, policy, bandName] = await Promise.all([
    fallbackAuthorId(),
    everyoneGroupId(),
    getConflictPolicy(),
    getBandName(),
  ]);
  if (!authorId || !groupId) return false;

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: DEFAULT_TZ }).format(now);
  const mail = monthlyDigestEmail({
    monthLabel,
    events: selection.events.map((e) => ({ title: e.title, when: formatEventWhen(e.date, e.time), location: e.location })),
    calendarUrl: publicCalendarUrl(),
    policy,
    bandName,
  });
  const announcementId = await queueAnnouncement(mail, authorId, groupId);
  await prisma.digestLog.create({ data: { period, announcementId } });
  return true;
}

export async function runDailyEventJobs(now = new Date()): Promise<{ reminders: number; digest: boolean }> {
  const reminders = await sendDueReminders(now);
  const digest = await sendMonthlyDigestIfDue(now);
  if (reminders || digest) console.log(`[event-comms] sent ${reminders} reminder(s)${digest ? " + monthly digest" : ""}`);
  return { reminders, digest };
}
