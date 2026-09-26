import { test } from "node:test";
import assert from "node:assert/strict";
import { matchContact, normalizeName } from "../src/lib/name-match.ts";

test("normalizeName: case, accents, apostrophes, hyphens, periods and spacing all vanish", () => {
  assert.equal(normalizeName("  José   O'Brien-Smith Jr. "), "joseobriensmithjr");
  assert.equal(normalizeName("Liam O’Brien"), "liamobrien"); // curly apostrophe
  assert.equal(normalizeName("ANN LEE"), "annlee");
  assert.equal(normalizeName(""), "");
});

const roster = [
  { id: "a", name: "Ann Lee" },
  { id: "j", name: "José Núñez" },
  { id: "o", name: "Liam O'Brien" },
];

test("matchContact: exact name matches", () => {
  const r = matchContact("Ann Lee", roster);
  assert.deepEqual(r, { ok: true, contact: roster[0] });
});

test("matchContact: case, spacing, accents and punctuation are forgiven", () => {
  assert.equal(matchContact("ann   lee ", roster).ok, true);
  assert.deepEqual(matchContact("jose nunez", roster), { ok: true, contact: roster[1] });
  assert.deepEqual(matchContact("Liam OBrien", roster), { ok: true, contact: roster[2] });
  assert.deepEqual(matchContact("liam o’brien", roster), { ok: true, contact: roster[2] });
});

test("matchContact: first name alone, typos and blanks are NOT_FOUND", () => {
  assert.deepEqual(matchContact("Ann", roster), { ok: false, reason: "NOT_FOUND" });
  assert.deepEqual(matchContact("Anne Lee", roster), { ok: false, reason: "NOT_FOUND" });
  assert.deepEqual(matchContact("   ", roster), { ok: false, reason: "NOT_FOUND" });
  assert.deepEqual(matchContact("Ann Lee", []), { ok: false, reason: "NOT_FOUND" });
});

test("matchContact: two roster names that normalize alike are AMBIGUOUS", () => {
  const twins = [...roster, { id: "j2", name: "Jose Nunez" }];
  assert.deepEqual(matchContact("José Núñez", twins), { ok: false, reason: "AMBIGUOUS" });
  // The other names still resolve.
  assert.equal(matchContact("Ann Lee", twins).ok, true);
});

test("matchContact: does not mutate the roster", () => {
  const copy = roster.map((c) => ({ ...c }));
  matchContact("Ann Lee", roster);
  assert.deepEqual(roster, copy);
});
