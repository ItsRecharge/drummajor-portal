import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_GROUPS, CONCERT_JAZZ_ONLY_GROUP, EVERYONE, normalizeGroupSelection } from "../src/lib/group-names.ts";

const groups = [
  { id: "g-all", name: "Everyone", builtIn: true },
  { id: "g-jazz", name: "Jazz Band", builtIn: true },
  { id: "g-cm", name: "Concert/Marching Band", builtIn: true },
  { id: "g-cj", name: "Concert/Jazz Band Only", builtIn: true },
  { id: "g-custom", name: "Seniors", builtIn: false },
];

test("built-in groups: Concert/Jazz Band Only is the fourth list", () => {
  assert.deepEqual(BUILTIN_GROUPS, [EVERYONE, "Jazz Band", "Concert/Marching Band", CONCERT_JAZZ_ONLY_GROUP]);
  assert.equal(CONCERT_JAZZ_ONLY_GROUP, "Concert/Jazz Band Only");
});

test("normalizeGroupSelection: empty selection is an error", () => {
  const r = normalizeGroupSelection([], groups);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /class list/i);
});

test("normalizeGroupSelection: drops unknown and custom ids, errors when nothing is left", () => {
  assert.deepEqual(normalizeGroupSelection(["g-custom", "nope", "g-jazz"], groups), { ok: true, ids: ["g-jazz"] });
  assert.equal(normalizeGroupSelection(["g-custom", "nope"], groups).ok, false);
});

test("normalizeGroupSelection: Everyone swallows the rest", () => {
  assert.deepEqual(normalizeGroupSelection(["g-jazz", "g-all", "g-cj"], groups), { ok: true, ids: ["g-all"] });
});

test("normalizeGroupSelection: keeps built-in order and de-duplicates", () => {
  assert.deepEqual(normalizeGroupSelection(["g-cj", "g-jazz", "g-cj"], groups), { ok: true, ids: ["g-jazz", "g-cj"] });
});
