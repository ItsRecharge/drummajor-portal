import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, type IcsEvent } from "../src/lib/ics.ts";

const NOW = new Date(Date.UTC(2026, 0, 2, 3, 4, 5)); // 2026-01-02T03:04:05Z

function base(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "evt-1@drummajor-portal",
    title: "Band Rehearsal",
    date: new Date(2026, 8, 15), // local Sept 15, 2026
    now: NOW,
    ...overrides,
  };
}

/** Split into content lines (after unfolding). */
function lines(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter((l) => l.length > 0);
}

test("timed event: floating DTSTART and DTEND = start + duration", () => {
  const out = lines(buildIcs(base({ time: "18:30", durationMinutes: 90 })));
  assert.ok(out.includes("DTSTART:20260915T183000"));
  assert.ok(out.includes("DTEND:20260915T200000"));
});

test("timed event: default duration is 60 minutes", () => {
  const out = lines(buildIcs(base({ time: "07:05" })));
  assert.ok(out.includes("DTSTART:20260915T070500"));
  assert.ok(out.includes("DTEND:20260915T080500"));
});

test("timed event crossing midnight rolls DTEND to the next day", () => {
  const out = lines(buildIcs(base({ time: "23:30", durationMinutes: 60 })));
  assert.ok(out.includes("DTSTART:20260915T233000"));
  assert.ok(out.includes("DTEND:20260916T003000"));
});

test("midnight crossover across a month boundary", () => {
  const out = lines(
    buildIcs(base({ date: new Date(2026, 8, 30), time: "23:00", durationMinutes: 120 })),
  );
  assert.ok(out.includes("DTSTART:20260930T230000"));
  assert.ok(out.includes("DTEND:20261001T010000"));
});

test("all-day event when time is absent", () => {
  const out = lines(buildIcs(base()));
  assert.ok(out.includes("DTSTART;VALUE=DATE:20260915"));
  assert.ok(out.includes("DTEND;VALUE=DATE:20260916"));
});

test("all-day event when time is null or empty", () => {
  for (const time of [null, ""]) {
    const out = lines(buildIcs(base({ time })));
    assert.ok(out.includes("DTSTART;VALUE=DATE:20260915"), `time=${JSON.stringify(time)}`);
    assert.ok(out.includes("DTEND;VALUE=DATE:20260916"), `time=${JSON.stringify(time)}`);
  }
});

test("all-day event at the end of the year rolls DTEND into the next year", () => {
  const out = lines(buildIcs(base({ date: new Date(2026, 11, 31) })));
  assert.ok(out.includes("DTSTART;VALUE=DATE:20261231"));
  assert.ok(out.includes("DTEND;VALUE=DATE:20270101"));
});

test("invalid time string is treated as all-day", () => {
  for (const time of ["6pm", "25:00", "12:60", "1830", "18:3"]) {
    const out = lines(buildIcs(base({ time })));
    assert.ok(out.includes("DTSTART;VALUE=DATE:20260915"), `time=${time}`);
    assert.ok(out.includes("DTEND;VALUE=DATE:20260916"), `time=${time}`);
    assert.ok(!out.some((l) => l.startsWith("DTSTART:")), `time=${time}`);
  }
});

test("escapes backslash, semicolon, comma, and newlines in text fields", () => {
  const out = lines(
    buildIcs(
      base({
        title: "A; B, C\\D",
        description: "Line one\nLine two\r\nLine three",
        location: "Gym, Bldg 2; Room 3",
      }),
    ),
  );
  assert.ok(out.includes("SUMMARY:A\\; B\\, C\\\\D"));
  assert.ok(out.includes("DESCRIPTION:Line one\\nLine two\\nLine three"));
  assert.ok(out.includes("LOCATION:Gym\\, Bldg 2\\; Room 3"));
});

test("folds lines longer than 75 octets; unfolding restores the content", () => {
  const description = "x".repeat(200);
  const ics = buildIcs(base({ description }));
  const raw = ics.split("\r\n");
  for (const line of raw) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line.length}`);
  }
  const folded = raw.filter((l) => l.startsWith(" "));
  assert.ok(folded.length >= 2, "expected at least two continuation lines");
  assert.ok(lines(ics).includes(`DESCRIPTION:${description}`));
});

test("folding counts UTF-8 bytes, not characters", () => {
  // Each "é" is 2 bytes; 60 of them = 120 bytes, well over 75 even though only 60 chars.
  const description = "é".repeat(60);
  const ics = buildIcs(base({ description }));
  const raw = ics.split("\r\n");
  for (const line of raw) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line}`);
  }
  assert.ok(raw.some((l) => l.startsWith(" ")), "expected a continuation line");
  assert.ok(lines(ics).includes(`DESCRIPTION:${description}`));
});

test("DTSTAMP is formatted in UTC from now", () => {
  const out = lines(buildIcs(base()));
  assert.ok(out.includes("DTSTAMP:20260102T030405Z"));
});

test("DTSTAMP defaults to the current time when now is omitted", () => {
  const before = Date.now();
  const out = lines(buildIcs(base({ now: undefined })));
  const stamp = out.find((l) => l.startsWith("DTSTAMP:"));
  assert.ok(stamp);
  const m = /^DTSTAMP:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  assert.ok(m, `bad DTSTAMP: ${stamp}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  assert.ok(Math.abs(ms - before) < 5_000);
});

test("optional fields are omitted when absent", () => {
  const out = lines(buildIcs(base()));
  assert.ok(!out.some((l) => l.startsWith("DESCRIPTION")));
  assert.ok(!out.some((l) => l.startsWith("LOCATION")));
  assert.ok(!out.some((l) => l.startsWith("URL")));
  assert.ok(!out.some((l) => l.startsWith("ORGANIZER")));

  const nulls = lines(
    buildIcs(base({ description: null, location: null, url: null, organizerEmail: null })),
  );
  assert.ok(!nulls.some((l) => l.startsWith("DESCRIPTION")));
  assert.ok(!nulls.some((l) => l.startsWith("LOCATION")));
  assert.ok(!nulls.some((l) => l.startsWith("URL")));
  assert.ok(!nulls.some((l) => l.startsWith("ORGANIZER")));

  const empties = lines(
    buildIcs(base({ description: "", location: "", url: "", organizerEmail: "" })),
  );
  assert.ok(!empties.some((l) => l.startsWith("DESCRIPTION")));
  assert.ok(!empties.some((l) => l.startsWith("LOCATION")));
  assert.ok(!empties.some((l) => l.startsWith("URL")));
  assert.ok(!empties.some((l) => l.startsWith("ORGANIZER")));
});

test("optional fields are emitted when present", () => {
  const out = lines(
    buildIcs(
      base({
        description: "Bring water",
        location: "Field",
        url: "https://portal.example.com/events/1",
        organizerEmail: "director@example.com",
      }),
    ),
  );
  assert.ok(out.includes("DESCRIPTION:Bring water"));
  assert.ok(out.includes("LOCATION:Field"));
  assert.ok(out.includes("URL:https://portal.example.com/events/1"));
  assert.ok(out.includes("ORGANIZER:mailto:director@example.com"));
});

test("full structure and ordering for a timed event", () => {
  const out = lines(
    buildIcs(
      base({
        time: "18:30",
        description: "Bring water",
        location: "Field",
        url: "https://portal.example.com/events/1",
        organizerEmail: "director@example.com",
      }),
    ),
  );
  assert.deepEqual(out, [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Drum Major Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:evt-1@drummajor-portal",
    "DTSTAMP:20260102T030405Z",
    "DTSTART:20260915T183000",
    "DTEND:20260915T193000",
    "SUMMARY:Band Rehearsal",
    "DESCRIPTION:Bring water",
    "LOCATION:Field",
    "URL:https://portal.example.com/events/1",
    "ORGANIZER:mailto:director@example.com",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
});

test("uses CRLF line endings throughout and ends with a trailing CRLF", () => {
  const ics = buildIcs(base({ description: "y".repeat(100) }));
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/(^|[^\r])\n/.test(ics), "found a bare LF");
  assert.ok(!/\r(?!\n)/.test(ics), "found a bare CR");
  assert.equal(ics.split("\r\n").length - 1, ics.split("\n").length - 1);
});

test("strips carriage returns from text and escapes remaining newlines", () => {
  const out = lines(buildIcs(base({ description: "a\rb\r\nc" })));
  assert.ok(out.includes("DESCRIPTION:ab\\nc"));
});

// --- Calendar feed (many events, METHOD:PUBLISH) ---------------------------

import { buildCalendarFeed } from "../src/lib/ics.ts";

test("buildCalendarFeed wraps every event in one PUBLISH calendar with a name", () => {
  const out = lines(
    buildCalendarFeed(
      [base({ uid: "a@x", title: "One" }), base({ uid: "b@x", title: "Two", time: "18:30" })],
      { name: "Winchester Band", now: NOW },
    ),
  );
  assert.equal(out[0], "BEGIN:VCALENDAR");
  assert.ok(out.includes("METHOD:PUBLISH"));
  assert.ok(out.includes("X-WR-CALNAME:Winchester Band"));
  assert.equal(out.filter((l) => l === "BEGIN:VEVENT").length, 2);
  assert.ok(out.includes("UID:a@x") && out.includes("UID:b@x"));
  assert.ok(out.includes("SUMMARY:One") && out.includes("SUMMARY:Two"));
  assert.ok(out.includes("DTSTART:20260915T183000"));
  assert.equal(out[out.length - 1], "END:VCALENDAR");
  assert.ok(!out.includes("METHOD:REQUEST"));
});

test("buildCalendarFeed with no events is still a valid empty calendar", () => {
  const out = lines(buildCalendarFeed([], { name: "Band; Events", now: NOW }));
  assert.deepEqual(out, [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Drum Major Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Band\\; Events",
    "END:VCALENDAR",
  ]);
});
