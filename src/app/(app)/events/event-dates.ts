// Event dates come from <input type="date"> and are stored as UTC midnight, so
// every display must read the UTC calendar fields or the day shifts west of
// Greenwich. Times are "HH:MM" strings kept separate from the date.

export function eventDay(date: Date): { year: number; month: number; day: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

// A local-time Date for the same calendar day (what the .ics builder expects).
export function eventLocalDate(date: Date): Date {
  const { year, month, day } = eventDay(date);
  return new Date(year, month, day);
}

export function formatEventDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...opts });
}

export function formatEventTime(time: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

export function formatEventWhen(date: Date, time: string | null | undefined): string {
  const t = formatEventTime(time);
  return `${formatEventDate(date, { weekday: "short" })}${t ? ` at ${t}` : ""}`;
}

// Start of today as a UTC-midnight Date, matching how event dates are stored.
export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}
