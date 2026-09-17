// Pure date math for event emails: which calendar day it is for the band (not
// the server), how many days until an event, and which reminder is due. Event
// dates are stored as UTC midnight (see src/app/(app)/events/event-dates.ts);
// "today" is the wall-clock day in the band's timezone. No Prisma here so the
// rules are unit-testable.

export const DEFAULT_TZ = "America/New_York";

export type ReminderKind = "WEEK_BEFORE" | "THREE_DAYS_BEFORE" | "DAY_OF";
export type NoticeKind = "ANNOUNCED" | ReminderKind;

// Days before the event each reminder goes out. Order = most distant first.
export const REMINDER_THRESHOLDS: Record<ReminderKind, number> = {
  WEEK_BEFORE: 7,
  THREE_DAYS_BEFORE: 3,
  DAY_OF: 0,
};
export const REMINDER_KINDS: readonly ReminderKind[] = ["WEEK_BEFORE", "THREE_DAYS_BEFORE", "DAY_OF"];

// A newly created event is emailed at once only if it's this close.
export const ANNOUNCE_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

export function calendarDayInZone(now: Date, tz = DEFAULT_TZ): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

// Today in the zone, as a UTC-midnight Date — directly comparable to event dates.
export function todayUtcInZone(now: Date, tz = DEFAULT_TZ): Date {
  const { year, month, day } = calendarDayInZone(now, tz);
  return new Date(Date.UTC(year, month, day));
}

export function daysUntil(eventDate: Date, now: Date, tz = DEFAULT_TZ): number {
  const event = Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate());
  return Math.round((event - todayUtcInZone(now, tz).getTime()) / DAY_MS);
}

export function shouldAnnounceOnCreate(days: number): boolean {
  return days >= 0 && days <= ANNOUNCE_WINDOW_DAYS;
}

// An email sent `days` before the event stands in for every reminder that
// would have gone out at or before that point.
export function coveredKinds(days: number): ReminderKind[] {
  return REMINDER_KINDS.filter((k) => REMINDER_THRESHOLDS[k] >= days);
}

// Which reminder to send today for an event `days` away, given what was
// already sent (or covered). At most one email per event per day: the most
// urgent outstanding kind is sent and every outstanding kind is recorded, so a
// missed day is caught up without a burst of duplicates.
export function dueReminder(
  days: number,
  sent: Iterable<NoticeKind>,
): { send: ReminderKind; record: ReminderKind[] } | null {
  if (days < 0 || days > REMINDER_THRESHOLDS.WEEK_BEFORE) return null;
  const done = new Set<NoticeKind>(sent);
  const outstanding = coveredKinds(days).filter((k) => !done.has(k));
  if (outstanding.length === 0) return null;
  return { send: outstanding[outstanding.length - 1], record: outstanding };
}

export function monthKey(now: Date, tz = DEFAULT_TZ): string {
  const { year, month } = calendarDayInZone(now, tz);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// The monthly overview: every remaining event this calendar month, sent only
// when at least one of them is more than a week away (nearer ones already got
// or will get their own emails).
export function digestSelection<T extends { date: Date }>(
  events: T[],
  now: Date,
  tz = DEFAULT_TZ,
): { events: T[]; shouldSend: boolean } {
  const { year, month } = calendarDayInZone(now, tz);
  const remaining = events
    .filter((e) => e.date.getUTCFullYear() === year && e.date.getUTCMonth() === month && daysUntil(e.date, now, tz) >= 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const shouldSend = remaining.some((e) => daysUntil(e.date, now, tz) > ANNOUNCE_WINDOW_DAYS);
  return { events: remaining, shouldSend };
}
