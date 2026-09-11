import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, parseIndexCsv, mergeIndex, type DbFileRow } from "../src/lib/music-index-csv.ts";

const HEADER = "category,folder,file,part,song,composer,arranger,source,confidence,note";

const file = (over: Partial<DbFileRow> = {}): DbFileRow => ({
  category: "Concert Band",
  folder: "Sleigh Ride - arr. Leroy Anderson",
  file: "Sleigh Ride - Flute 1 to Clarinet 2.pdf",
  partGuess: "Flute 1 to Clarinet 2",
  song: "Sleigh Ride",
  composer: "",
  arranger: "Leroy Anderson",
  ...over,
});

test("toCsv writes the legacy header, CRLF, trailing newline, and quotes as needed", () => {
  const csv = toCsv(
    mergeIndex("", [file({ file: "Sing, Sing, Sing - Alto Sax 1.pdf", folder: 'Sing, Sing, Sing - "Louis" Prima' })]),
  );
  const lines = csv.split("\r\n");
  assert.equal(lines[0], HEADER);
  assert.equal(
    lines[1],
    'Concert Band,"Sing, Sing, Sing - ""Louis"" Prima","Sing, Sing, Sing - Alto Sax 1.pdf",Flute 1 to Clarinet 2,Sleigh Ride,,Leroy Anderson,,high,',
  );
  assert.equal(lines[2], "");
  assert.ok(csv.endsWith("\r\n"));
});

test("parseIndexCsv reads the legacy file and tolerates missing columns", () => {
  const rows = parseIndexCsv(`${HEADER}\r\nJazz Band,A - arr. B,a.pdf,Full set,A,,B,src/a.pdf,high,"note, with comma"\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, "note, with comma");
  assert.equal(rows[0].source, "src/a.pdf");
  const partial = parseIndexCsv("folder,file\nX - Y,x.pdf\n");
  assert.equal(partial[0].folder, "X - Y");
  assert.equal(partial[0].part, "");
});

test("mergeIndex keeps curated cells, fills gaps from the DB, drops vanished files, adds new ones", () => {
  const existing = [
    HEADER,
    "Concert Band,Sleigh Ride - arr. Leroy Anderson,Sleigh Ride - Flute 1 to Clarinet 2.pdf,1st C Flute,Sleigh Ride,Leroy Anderson (composer!),Leroy Anderson,Music/old.pdf,med,curated note",
    "Concert Band,Sleigh Ride - arr. Leroy Anderson,gone.pdf,Full set,Sleigh Ride,,,x,high,",
    "",
  ].join("\r\n");
  const rows = mergeIndex(existing, [file(), file({ file: "Sleigh Ride - Tuba.pdf", partGuess: "Tuba" })]);
  assert.equal(rows.length, 2);
  const kept = rows.find((r) => r.file.includes("Flute"))!;
  assert.equal(kept.part, "1st C Flute"); // curated wins over the guess
  assert.equal(kept.composer, "Leroy Anderson (composer!)");
  assert.equal(kept.source, "Music/old.pdf");
  assert.equal(kept.confidence, "med");
  assert.equal(kept.note, "curated note");
  const added = rows.find((r) => r.file.includes("Tuba"))!;
  assert.equal(added.part, "Tuba");
  assert.equal(added.arranger, "Leroy Anderson");
  assert.equal(added.confidence, "high");
  assert.equal(added.source, "");
  assert.ok(!rows.some((r) => r.file === "gone.pdf"));
});

test("mergeIndex leaves confidence blank for files that don't follow the naming convention", () => {
  const [row] = mergeIndex("", [file({ file: "Sleigh Ride EPRINT.pdf", partGuess: "" })]);
  assert.equal(row.part, "");
  assert.equal(row.confidence, "");
});

test("mergeIndex output is sorted by category, folder, file", () => {
  const rows = mergeIndex("", [
    file({ category: "Jazz Band", folder: "Z", file: "b.pdf" }),
    file({ category: "Concert Band", folder: "B", file: "a.pdf" }),
    file({ category: "Concert Band", folder: "A", file: "z.pdf" }),
  ]);
  assert.deepEqual(
    rows.map((r) => `${r.category}/${r.folder}/${r.file}`),
    ["Concert Band/A/z.pdf", "Concert Band/B/a.pdf", "Jazz Band/Z/b.pdf"],
  );
});
