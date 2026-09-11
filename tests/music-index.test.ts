import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, type IndexRow } from "../src/lib/music-index-csv.ts";

const row = (over: Partial<IndexRow> = {}): IndexRow => ({
  category: "Concert Band",
  title: "Sleigh Ride",
  creditType: "Arranger",
  credit: "Leroy Anderson",
  parts: "Flute 1 to Clarinet 2; Trumpet 1",
  files: 2,
  link: "https://drive.google.com/x",
  updated: "2026-09-11",
  ...over,
});

test("header + rows, CRLF, trailing newline", () => {
  const csv = toCsv([row()]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Category,Title,Credit Type,Composer/Arranger,Parts,Files,Drive Link,Updated");
  assert.equal(lines[1], "Concert Band,Sleigh Ride,Arranger,Leroy Anderson,Flute 1 to Clarinet 2; Trumpet 1,2,https://drive.google.com/x,2026-09-11");
  assert.equal(lines[2], "");
  assert.ok(csv.endsWith("\r\n"));
});

test("quotes cells containing commas, quotes, or newlines", () => {
  const csv = toCsv([row({ title: 'Sing, Sing, Sing', credit: 'Louis "Satchmo" Prima', parts: "a\nb" })]);
  assert.match(csv, /"Sing, Sing, Sing"/);
  assert.match(csv, /"Louis ""Satchmo"" Prima"/);
  assert.match(csv, /"a\nb"/);
});

test("empty catalog is just the header", () => {
  assert.equal(toCsv([]), "Category,Title,Credit Type,Composer/Arranger,Parts,Files,Drive Link,Updated\r\n");
});
