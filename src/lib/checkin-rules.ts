// The rules of QR self check-in, as pure functions over plain data so they run
// under node:test. src/lib/checkin-data.ts loads the facts from Prisma and
// applies them here; the public action turns the result into a form state.
import { haversineM, type LatLng } from "./geo.ts";
import { matchContact } from "./name-match.ts";
import { DEFAULT_TZ, todayUtcInZone } from "./event-schedule.ts";

// Phones reporting worse than this are told to turn on precise location.
export const MAX_ACCURACY_M = 200;
// Beyond this share of the radius a check-in is flagged EDGE for review.
export const EDGE_FRACTION = 0.7;
// Scans this long after the event's start time are flagged LATE (never
// rejected; the mark is still Present — a drum major decides).
export const LATE_GRACE_MIN = 10;

export const CHECKIN_FLAGS = ["DUP_NAME", "NEW_DEVICE", "EDGE", "LATE"] as const;
export type CheckInFlag = (typeof CHECKIN_FLAGS)[number];

export const CHECKIN_FLAG_LABELS: Record<CheckInFlag, string> = {
  DUP_NAME: "Duplicate name",
  NEW_DEVICE: "New phone",
  EDGE: "Edge of radius",
  LATE: "Late scan",
};

export function isCheckInFlag(v: unknown): v is CheckInFlag {
  return typeof v === "string" && (CHECKIN_FLAGS as readonly string[]).includes(v);
}

// Every message a student can see. "See a drum major" is the escape hatch:
// the sheet still takes taps.
export const CHECKIN_ERRORS = {
  DISABLED: "QR check-in is turned off.",
  NOT_BAND: "This link isn't valid.",
  CLOSED: "Check-in isn't open for this event. See a drum major.",
  NOT_TODAY: "Check-in only works on the day of the event.",
  BAD_TOKEN: "This QR code expired — scan it again.",
  BAD_TICKET: "This page expired — scan the QR code again.",
  NO_LOCATION: "Share your location to check in.",
  IMPRECISE: "Turn on precise location and try again.",
  TOO_FAR: "You're not close enough to the event. See a drum major.",
  NAME_NOT_FOUND: "Name not found — check spelling or see a drum major.",
  NAME_AMBIGUOUS: "See a drum major.",
  RATE_LIMITED: "Too many tries. Wait a minute and try again.",
  deviceBound: (name: string) => `This phone already checked in as ${name}. See a drum major.`,
} as const;

export type Rejection = { ok: false; error: string };
const fail = (error: string): Rejection => ({ ok: false, error });

export type SessionState = {
  enabled: boolean;
  audience: "BAND" | "DRUM_MAJORS";
  // UTC midnight, as stored on Event.date.
  eventDate: Date;
  // "HH:MM" or null, as stored on Event.time.
  time: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  // The drum major's phone when they opened check-in.
  anchor: LatLng | null;
  radiusM: number;
};

// Open = turned on, a band event, opened and not closed, and it's the event's
// day in the band's timezone (so a session dies at midnight by itself).
export function sessionOpen(s: SessionState, now: Date, tz = DEFAULT_TZ): { ok: true } | Rejection {
  if (!s.enabled) return fail(CHECKIN_ERRORS.DISABLED);
  if (s.audience !== "BAND") return fail(CHECKIN_ERRORS.NOT_BAND);
  if (!s.openedAt || s.closedAt || !s.anchor) return fail(CHECKIN_ERRORS.CLOSED);
  if (s.eventDate.getTime() !== todayUtcInZone(now, tz).getTime()) return fail(CHECKIN_ERRORS.NOT_TODAY);
  return { ok: true };
}

export type Location = { lat: number; lng: number; accuracyM: number };

export function checkLocation(
  loc: Location | null,
  anchor: LatLng,
  radiusM: number,
): { ok: true; distanceM: number } | Rejection {
  if (!loc) return fail(CHECKIN_ERRORS.NO_LOCATION);
  if (loc.accuracyM > MAX_ACCURACY_M) return fail(CHECKIN_ERRORS.IMPRECISE);
  const distanceM = haversineM(loc, anchor);
  if (distanceM > radiusM) return fail(CHECKIN_ERRORS.TOO_FAR);
  return { ok: true, distanceM };
}

// This device's check-ins at other events. A phone belongs to the first
// student it checked in as; it can't be someone else's later.
export type DeviceHistory = { contactId: string; contactName: string }[];

export function checkDeviceBinding(history: DeviceHistory, contactId: string): { ok: true } | Rejection {
  const other = history.find((h) => h.contactId !== contactId);
  return other ? fail(CHECKIN_ERRORS.deviceBound(other.contactName)) : { ok: true };
}

export function minuteOfDayInZone(now: Date, tz = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}

export function isLateScan(time: string | null, now: Date, tz = DEFAULT_TZ): boolean {
  const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  if (!m) return false;
  const start = Number(m[1]) * 60 + Number(m[2]);
  return minuteOfDayInZone(now, tz) > start + LATE_GRACE_MIN;
}

export type FlagFacts = {
  distanceM: number;
  radiusM: number;
  // Another phone already checked in as this student at this event.
  otherDeviceForContactAtEvent: boolean;
  // This student used a different phone at an earlier event.
  contactSeenOnOtherDevice: boolean;
  time: string | null;
  now: Date;
  tz?: string;
};

// Review hints for the sheet, never rejections. Stable order.
export function computeFlags(f: FlagFacts): CheckInFlag[] {
  const flags: CheckInFlag[] = [];
  if (f.otherDeviceForContactAtEvent) flags.push("DUP_NAME");
  if (f.contactSeenOnOtherDevice) flags.push("NEW_DEVICE");
  if (f.distanceM > f.radiusM * EDGE_FRACTION) flags.push("EDGE");
  if (isLateScan(f.time, f.now, f.tz)) flags.push("LATE");
  return flags;
}

export type EvalInput = {
  session: SessionState;
  now: Date;
  typedName: string;
  roster: readonly { id: string; name: string }[];
  location: Location | null;
  deviceHistory: DeviceHistory;
  tz?: string;
};

// Everything that can be decided before writing: session, location, name,
// device — in that order, stopping at the first failure.
export function evaluateSubmission(
  i: EvalInput,
): { ok: true; contact: { id: string; name: string }; distanceM: number } | Rejection {
  const open = sessionOpen(i.session, i.now, i.tz);
  if (!open.ok) return open;
  const loc = checkLocation(i.location, i.session.anchor as LatLng, i.session.radiusM);
  if (!loc.ok) return loc;
  const name = matchContact(i.typedName, i.roster);
  if (!name.ok) return fail(name.reason === "AMBIGUOUS" ? CHECKIN_ERRORS.NAME_AMBIGUOUS : CHECKIN_ERRORS.NAME_NOT_FOUND);
  const device = checkDeviceBinding(i.deviceHistory, name.contact.id);
  if (!device.ok) return device;
  return { ok: true, contact: name.contact, distanceM: loc.distanceM };
}
