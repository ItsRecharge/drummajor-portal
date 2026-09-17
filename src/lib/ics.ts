/**
 * Minimal RFC 5545 iCalendar builder.
 *
 * `buildIcs` makes a single-event invite for nodemailer's
 * `icalEvent: { method: "REQUEST", content }`; `buildCalendarFeed` makes a
 * subscribable PUBLISH calendar of many events for the public calendar page.
 * Dates/times are emitted as FLOATING local time (no `Z`, no TZID) so every
 * calendar app shows the wall-clock time the organizer typed.
 */

export type IcsEvent = {
  /** Stable id, e.g. `${eventId}@drummajor-portal`. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** The event date; its LOCAL Y/M/D components are used. */
  date: Date;
  /** "HH:MM" 24h from an <input type="time">; null/"" → all-day. */
  time?: string | null;
  /** Default 60 when a time is given. */
  durationMinutes?: number;
  organizerEmail?: string | null;
  url?: string | null;
  /** For DTSTAMP; default `new Date()`. */
  now?: Date;
};

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;
const DEFAULT_DURATION_MINUTES = 60;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** YYYYMMDD from UTC components. */
function fmtDateUtc(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** YYYYMMDDTHHMMSS from UTC components (no trailing Z). */
function fmtDateTimeUtc(d: Date): string {
  return `${fmtDateUtc(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** Parse strict "HH:MM" (24h). Returns null for anything else. */
function parseTime(time: string | null | undefined): { h: number; m: number } | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Strip line breaks (and other control chars) from non-TEXT values such as URIs and UIDs. */
function stripControl(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "").trim();
}

function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Fold a content line so no physical line exceeds 75 octets (RFC 5545 §3.1).
 * Continuation lines start with a single space, which counts toward the limit.
 * Splits happen only between code points, never inside a multi-byte character.
 */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const ch of line) {
    const bytes = utf8Bytes(ch.codePointAt(0) ?? 0);
    if (currentBytes + bytes > MAX_LINE_OCTETS) {
      out.push(current);
      current = " ";
      currentBytes = 1;
    }
    current += ch;
    currentBytes += bytes;
  }
  out.push(current);
  return out;
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const CALENDAR_HEAD = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Drum Major Portal//EN", "CALSCALE:GREGORIAN"];

/** The VEVENT block (BEGIN..END) for one event. */
function vevent(ev: IcsEvent, now: Date): string[] {
  const y = ev.date.getFullYear();
  const mo = ev.date.getMonth();
  const d = ev.date.getDate();

  // All arithmetic is done on UTC-constructed dates built from the LOCAL
  // components, so rolling over midnight/month/year is timezone- and DST-safe.
  const time = parseTime(ev.time);
  let dtstart: string;
  let dtend: string;
  if (time) {
    const duration =
      typeof ev.durationMinutes === "number" &&
      Number.isFinite(ev.durationMinutes) &&
      ev.durationMinutes >= 0
        ? Math.round(ev.durationMinutes)
        : DEFAULT_DURATION_MINUTES;
    const start = new Date(Date.UTC(y, mo, d, time.h, time.m));
    const end = new Date(Date.UTC(y, mo, d, time.h, time.m + duration));
    dtstart = `DTSTART:${fmtDateTimeUtc(start)}`;
    dtend = `DTEND:${fmtDateTimeUtc(end)}`;
  } else {
    const start = new Date(Date.UTC(y, mo, d));
    const end = new Date(Date.UTC(y, mo, d + 1));
    dtstart = `DTSTART;VALUE=DATE:${fmtDateUtc(start)}`;
    dtend = `DTEND;VALUE=DATE:${fmtDateUtc(end)}`;
  }

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${stripControl(ev.uid)}`,
    `DTSTAMP:${fmtDateTimeUtc(now)}Z`,
    dtstart,
    dtend,
    `SUMMARY:${escapeText(ev.title.trim())}`,
  ];

  if (hasValue(ev.description)) lines.push(`DESCRIPTION:${escapeText(ev.description.trim())}`);
  if (hasValue(ev.location)) lines.push(`LOCATION:${escapeText(ev.location.trim())}`);
  if (hasValue(ev.url)) lines.push(`URL:${stripControl(ev.url)}`);
  if (hasValue(ev.organizerEmail)) lines.push(`ORGANIZER:mailto:${stripControl(ev.organizerEmail)}`);

  lines.push("STATUS:CONFIRMED", "END:VEVENT");
  return lines;
}

function serialize(lines: string[]): string {
  return lines.flatMap(fold).join(CRLF) + CRLF;
}

/** One-event invite (METHOD:REQUEST) for an email attachment. */
export function buildIcs(ev: IcsEvent): string {
  const now = ev.now ?? new Date();
  return serialize([...CALENDAR_HEAD, "METHOD:REQUEST", ...vevent(ev, now), "END:VCALENDAR"]);
}

/** Subscribable calendar (METHOD:PUBLISH) holding every event. */
export function buildCalendarFeed(events: IcsEvent[], opts: { name: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  return serialize([
    ...CALENDAR_HEAD,
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name.trim())}`,
    ...events.flatMap((ev) => vevent(ev, ev.now ?? now)),
    "END:VCALENDAR",
  ]);
}
