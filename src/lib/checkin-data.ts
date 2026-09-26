// Prisma-facing side of QR self check-in. The rules are pure functions in
// ./checkin-rules.ts; this module loads the facts, applies them, and writes
// the CheckIn row plus the attendance mark in one transaction.
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { broadcastSheet, getEventRoster } from "@/lib/attendance-data";
import { todayUtcInZone } from "@/lib/event-schedule";
import {
  CHECKIN_ERRORS,
  MAX_ACCURACY_M,
  computeFlags,
  evaluateSubmission,
  type CheckInFlag,
  type Location,
  type SessionState,
} from "@/lib/checkin-rules";
import { AttendanceStatus, EventAudience, type Event } from "@/generated/prisma/client";

export const DEFAULT_RADIUS_M = 150;

export type CheckInSession = {
  openedAt: string | null;
  closedAt: string | null;
  openedBy: string | null;
  anchor: { lat: number; lng: number; accuracyM: number } | null;
  radiusM: number;
  count: number;
  isOpen: boolean;
};

// What the drum major's QR page shows.
export async function loadCheckInSession(eventId: string): Promise<CheckInSession | null> {
  const [event, settings] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: { checkInOpenedBy: { select: { name: true } }, _count: { select: { checkIns: true } } },
    }),
    getAppSettings(),
  ]);
  if (!event) return null;
  return {
    openedAt: event.checkInOpenedAt?.toISOString() ?? null,
    closedAt: event.checkInClosedAt?.toISOString() ?? null,
    openedBy: event.checkInOpenedBy?.name ?? null,
    anchor:
      event.checkInLat != null && event.checkInLng != null
        ? { lat: event.checkInLat, lng: event.checkInLng, accuracyM: event.checkInAccuracyM ?? 0 }
        : null,
    radiusM: event.checkInRadiusM ?? settings?.checkInRadiusM ?? DEFAULT_RADIUS_M,
    count: event._count.checkIns,
    isOpen: event.checkInOpenedAt !== null && event.checkInClosedAt === null,
  };
}

type Loaded = { event: Event; state: SessionState; settingRadiusM: number };

// The event plus the plain-data session the rules run on.
export async function loadSessionState(eventId: string): Promise<Loaded | null> {
  const [event, settings] = await Promise.all([prisma.event.findUnique({ where: { id: eventId } }), getAppSettings()]);
  if (!event) return null;
  const settingRadiusM = settings?.checkInRadiusM ?? DEFAULT_RADIUS_M;
  return {
    event,
    settingRadiusM,
    state: {
      enabled: settings?.checkInEnabled ?? false,
      audience: event.audience,
      eventDate: event.date,
      time: event.time,
      openedAt: event.checkInOpenedAt,
      closedAt: event.checkInClosedAt,
      anchor:
        event.checkInLat != null && event.checkInLng != null ? { lat: event.checkInLat, lng: event.checkInLng } : null,
      radiusM: event.checkInRadiusM ?? settingRadiusM,
    },
  };
}

export type OpenResult = { ok: true } | { ok: false; error: string };

// Opening (or re-opening) captures the drum major's phone as the anchor and
// snapshots the radius. Only on the event's day, never once published.
export async function openCheckIn(
  eventId: string,
  actorId: string,
  anchor: { lat: number; lng: number; accuracyM: number },
): Promise<OpenResult> {
  const loaded = await loadSessionState(eventId);
  if (!loaded || loaded.event.audience !== EventAudience.BAND) return { ok: false, error: "Event not found." };
  const { event, state, settingRadiusM } = loaded;
  if (!state.enabled) return { ok: false, error: "QR check-in is turned off in Settings." };
  const now = new Date();
  if (event.date.getTime() !== todayUtcInZone(now).getTime()) {
    return { ok: false, error: "Check-in can only be opened on the day of the event." };
  }
  if (event.attendancePublishedAt) {
    return { ok: false, error: "This sheet is published — mark students on the sheet instead." };
  }
  if (anchor.accuracyM > MAX_ACCURACY_M) {
    return {
      ok: false,
      error: `Your location is too imprecise (±${Math.round(anchor.accuracyM)} m). Turn on precise location and try again.`,
    };
  }
  await prisma.event.update({
    where: { id: eventId },
    data: {
      checkInOpenedAt: now,
      checkInClosedAt: null,
      checkInOpenedById: actorId,
      checkInLat: anchor.lat,
      checkInLng: anchor.lng,
      checkInAccuracyM: anchor.accuracyM,
      checkInRadiusM: settingRadiusM,
    },
  });
  return { ok: true };
}

// True if it was open.
export async function closeCheckIn(eventId: string): Promise<boolean> {
  const r = await prisma.event.updateMany({
    where: { id: eventId, checkInOpenedAt: { not: null }, checkInClosedAt: null },
    data: { checkInClosedAt: new Date() },
  });
  return r.count > 0;
}

export type SubmitInput = {
  eventId: string;
  deviceId: string;
  typedName: string;
  location: Location;
  ipAddress: string | null;
  userAgent: string | null;
  now: Date;
};

export type SubmitResult =
  | {
      ok: true;
      contactName: string;
      checkedInAt: string;
      flags: CheckInFlag[];
      distanceM: number;
      renamedFrom: string | null;
    }
  | { ok: false; error: string };

// A student's submission. Rejections store nothing. A success upserts this
// phone's CheckIn row and marks the student Present — unless a drum major
// already marked them Late/Excused, or marked them Absent after an earlier
// scan, in which case only the check-in stamp is recorded. Re-submitting from
// the same phone at the same event moves the mark (a typo fix).
export async function submitCheckIn(i: SubmitInput): Promise<SubmitResult> {
  const loaded = await loadSessionState(i.eventId);
  if (!loaded) return { ok: false, error: CHECKIN_ERRORS.NOT_BAND };
  const { event, state } = loaded;
  const { eventId, deviceId, now } = i;

  const [{ contacts }, history] = await Promise.all([
    getEventRoster(eventId),
    prisma.checkIn.findMany({
      where: { deviceId, eventId: { not: eventId } },
      select: { contactId: true, contact: { select: { name: true } } },
    }),
  ]);
  const verdict = evaluateSubmission({
    session: state,
    now,
    typedName: i.typedName,
    roster: contacts,
    location: i.location,
    deviceHistory: history.map((h) => ({ contactId: h.contactId, contactName: h.contact.name })),
  });
  if (!verdict.ok) return verdict;
  const contactId = verdict.contact.id;
  const { distanceM } = verdict;

  const deviceKey = { eventId_deviceId: { eventId, deviceId } };
  const [prev, dupAtEvent, seenElsewhere] = await Promise.all([
    prisma.checkIn.findUnique({ where: deviceKey, include: { contact: { select: { name: true } } } }),
    prisma.checkIn.findFirst({ where: { eventId, contactId, deviceId: { not: deviceId } }, select: { id: true } }),
    prisma.checkIn.findFirst({
      where: { contactId, eventId: { not: eventId }, deviceId: { not: deviceId } },
      select: { id: true },
    }),
  ]);
  const flags = computeFlags({
    distanceM,
    radiusM: state.radiusM,
    otherDeviceForContactAtEvent: dupAtEvent !== null,
    contactSeenOnOtherDevice: seenElsewhere !== null,
    time: event.time,
    now,
  });
  const renamedFrom = prev && prev.contactId !== contactId ? prev.contact.name : null;
  const facts = {
    contactId,
    typedName: i.typedName.trim(),
    lat: i.location.lat,
    lng: i.location.lng,
    accuracyM: i.location.accuracyM,
    distanceM,
    flags,
    ipAddress: i.ipAddress,
    userAgent: i.userAgent,
  };

  await prisma.$transaction(async (tx) => {
    await tx.checkIn.upsert({ where: deviceKey, create: { eventId, deviceId, ...facts }, update: facts });

    // A rename frees the old name — unless another phone also claimed it.
    if (prev && prev.contactId !== contactId) {
      const oldKey = { eventId_contactId: { eventId, contactId: prev.contactId } };
      const stillClaimed = await tx.checkIn.count({ where: { eventId, contactId: prev.contactId } });
      const old = stillClaimed === 0 ? await tx.attendanceRecord.findUnique({ where: oldKey }) : null;
      if (old?.checkedInAt) {
        await tx.attendanceRecord.update({
          where: oldKey,
          data:
            old.status === AttendanceStatus.PRESENT
              ? { status: AttendanceStatus.ABSENT, checkedInAt: null }
              : { checkedInAt: null },
        });
      }
    }

    const key = { eventId_contactId: { eventId, contactId } };
    const existing = await tx.attendanceRecord.findUnique({ where: key });
    if (!existing) {
      await tx.attendanceRecord.create({
        data: { eventId, contactId, status: AttendanceStatus.PRESENT, checkedInAt: now },
      });
    } else if (existing.status === AttendanceStatus.ABSENT && existing.checkedInAt === null) {
      await tx.attendanceRecord.update({ where: key, data: { status: AttendanceStatus.PRESENT, checkedInAt: now } });
    } else {
      await tx.attendanceRecord.update({ where: key, data: { checkedInAt: now } });
    }
    await tx.event.updateMany({ where: { id: eventId, attendanceTakenAt: null }, data: { attendanceTakenAt: now } });
  });

  await broadcastSheet(eventId);
  return {
    ok: true,
    contactName: verdict.contact.name,
    checkedInAt: now.toISOString(),
    flags,
    distanceM,
    renamedFrom,
  };
}
