import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MUSIC_CATEGORIES,
  CATEGORY_FOLDERS,
  CATEGORY_LABELS,
  categoryFromFolderName,
  parsePieceFolderName,
  pieceFolderName,
  PART_ORDER,
  partIndex,
  sortParts,
  partFileName,
  parsePartFileName,
  sortPartFiles,
  suggestParts,
  type MusicCategory,
  type PieceName,
} from "../src/lib/music-naming.ts";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

test("MUSIC_CATEGORIES lists the seven enum members in order", () => {
  assert.deepEqual([...MUSIC_CATEGORIES], [
    "CONCERT_BAND",
    "JAZZ_BAND",
    "MARCHING_BAND",
    "MISCELLANEOUS",
    "MUSICAL",
    "ORCHESTRA",
    "SOLO_ENSEMBLE",
  ]);
});

test("CATEGORY_FOLDERS maps every category to its Drive folder name", () => {
  assert.deepEqual(CATEGORY_FOLDERS, {
    CONCERT_BAND: "Concert Band",
    JAZZ_BAND: "Jazz Band",
    MARCHING_BAND: "Marching Band",
    MISCELLANEOUS: "Misc. (Non-Music)",
    MUSICAL: "Musical (Pit)",
    ORCHESTRA: "Orchestra",
    SOLO_ENSEMBLE: "Solo & Ensemble",
  });
});

test("CATEGORY_LABELS maps every category to a human label", () => {
  assert.deepEqual(CATEGORY_LABELS, {
    CONCERT_BAND: "Concert Band",
    JAZZ_BAND: "Jazz Band",
    MARCHING_BAND: "Marching Band",
    MISCELLANEOUS: "Misc. (Non-Music)",
    MUSICAL: "Musical (Pit)",
    ORCHESTRA: "Orchestra",
    SOLO_ENSEMBLE: "Solo & Ensemble",
  });
});

test("categoryFromFolderName round-trips every CATEGORY_FOLDERS value", () => {
  for (const cat of MUSIC_CATEGORIES) {
    assert.equal(categoryFromFolderName(CATEGORY_FOLDERS[cat]), cat);
  }
});

test("categoryFromFolderName ignores case and non-alphanumeric characters", () => {
  assert.equal(categoryFromFolderName("Solo/Ensemble"), "SOLO_ENSEMBLE");
  assert.equal(categoryFromFolderName("Solo-Ensemble"), "SOLO_ENSEMBLE");
  assert.equal(categoryFromFolderName("solo ensemble"), "SOLO_ENSEMBLE");
  assert.equal(categoryFromFolderName("SOLO_ENSEMBLE"), "SOLO_ENSEMBLE");
  assert.equal(categoryFromFolderName("concert band"), "CONCERT_BAND");
  assert.equal(categoryFromFolderName("Misc. (Non-Music)"), "MISCELLANEOUS");
  assert.equal(categoryFromFolderName("Miscellaneous"), "MISCELLANEOUS");
  assert.equal(categoryFromFolderName("Musical (Pit)"), "MUSICAL");
  assert.equal(categoryFromFolderName("Musical"), "MUSICAL");
  assert.equal(categoryFromFolderName("ConcertBand"), "CONCERT_BAND");
  assert.equal(categoryFromFolderName("  Jazz   Band  "), "JAZZ_BAND");
  assert.equal(categoryFromFolderName("MARCHING BAND!"), "MARCHING_BAND");
  assert.equal(categoryFromFolderName("musical"), "MUSICAL");
  assert.equal(categoryFromFolderName("Orchestra"), "ORCHESTRA");
  assert.equal(categoryFromFolderName("miscellaneous"), "MISCELLANEOUS");
});

test("categoryFromFolderName returns null for anything that is not an exact normalized match", () => {
  assert.equal(categoryFromFolderName("Symphonic Winds"), null);
  assert.equal(categoryFromFolderName("Symphony Orchestra Winds"), null);
  assert.equal(categoryFromFolderName("Band Music Database"), null);
  assert.equal(categoryFromFolderName("Concert Band 2024"), null);
  assert.equal(categoryFromFolderName(""), null);
  assert.equal(categoryFromFolderName("---"), null);
});

// ---------------------------------------------------------------------------
// Piece folder names
// ---------------------------------------------------------------------------

test("parsePieceFolderName recognises an arranger credit", () => {
  assert.deepEqual(parsePieceFolderName("Sing, Sing, Sing - arr. Bill Holcombe"), {
    title: "Sing, Sing, Sing",
    credit: "Bill Holcombe",
    creditType: "ARRANGER",
  });
});

test("parsePieceFolderName accepts arr / Arr. / ARR. spellings", () => {
  for (const prefix of ["arr", "arr.", "Arr", "Arr.", "ARR", "ARR."]) {
    assert.deepEqual(
      parsePieceFolderName(`Title - ${prefix} Jane Doe`),
      { title: "Title", credit: "Jane Doe", creditType: "ARRANGER" },
      `prefix ${prefix}`,
    );
  }
});

test("parsePieceFolderName treats a plain credit as the composer", () => {
  assert.deepEqual(parsePieceFolderName("Hey Jude - Lennon-McCartney"), {
    title: "Hey Jude",
    credit: "Lennon-McCartney",
    creditType: "COMPOSER",
  });
});

test("parsePieceFolderName does not confuse names starting with 'Arr' for arrangers", () => {
  assert.deepEqual(parsePieceFolderName("Title - Arrival Smith"), {
    title: "Title",
    credit: "Arrival Smith",
    creditType: "COMPOSER",
  });
});

test("parsePieceFolderName returns null credit when there is no separator", () => {
  assert.deepEqual(parsePieceFolderName("Stars and Stripes Forever"), {
    title: "Stars and Stripes Forever",
    credit: null,
    creditType: null,
  });
  // a hyphen without surrounding spaces is part of the title
  assert.deepEqual(parsePieceFolderName("Lennon-McCartney Medley"), {
    title: "Lennon-McCartney Medley",
    credit: null,
    creditType: null,
  });
});

test("parsePieceFolderName splits on the first ' - ' only", () => {
  assert.deepEqual(parsePieceFolderName("Hey Jude - Lennon-McCartney - Extra"), {
    title: "Hey Jude",
    credit: "Lennon-McCartney - Extra",
    creditType: "COMPOSER",
  });
});

test("parsePieceFolderName trims and collapses whitespace", () => {
  assert.deepEqual(parsePieceFolderName("   Sing,  Sing,   Sing   -   arr.   Bill   Holcombe  "), {
    title: "Sing, Sing, Sing",
    credit: "Bill Holcombe",
    creditType: "ARRANGER",
  });
  assert.deepEqual(parsePieceFolderName("  Title  "), {
    title: "Title",
    credit: null,
    creditType: null,
  });
});

test("parsePieceFolderName treats a dangling separator as no credit", () => {
  assert.deepEqual(parsePieceFolderName("Title - "), {
    title: "Title",
    credit: null,
    creditType: null,
  });
});

test("pieceFolderName formats each credit type", () => {
  assert.equal(
    pieceFolderName({ title: "Sing, Sing, Sing", credit: "Bill Holcombe", creditType: "ARRANGER" }),
    "Sing, Sing, Sing - arr. Bill Holcombe",
  );
  assert.equal(
    pieceFolderName({ title: "Hey Jude", credit: "Lennon-McCartney", creditType: "COMPOSER" }),
    "Hey Jude - Lennon-McCartney",
  );
  assert.equal(pieceFolderName({ title: "Title", credit: null, creditType: null }), "Title");
  // a credit without a type is treated as a composer credit
  assert.equal(pieceFolderName({ title: "Title", credit: "Someone", creditType: null }), "Title - Someone");
  // an empty credit is dropped
  assert.equal(pieceFolderName({ title: "Title", credit: "   ", creditType: "COMPOSER" }), "Title");
});

test("piece folder names round-trip through parse and format", () => {
  const names = [
    "Sing, Sing, Sing - arr. Bill Holcombe",
    "Hey Jude - Lennon-McCartney",
    "Stars and Stripes Forever",
    "Symphony No. 5 - Beethoven",
  ];
  for (const name of names) {
    assert.equal(pieceFolderName(parsePieceFolderName(name)), name);
  }
  const pieces: PieceName[] = [
    { title: "A", credit: "B", creditType: "ARRANGER" },
    { title: "A", credit: "B", creditType: "COMPOSER" },
    { title: "A", credit: null, creditType: null },
  ];
  for (const piece of pieces) {
    assert.deepEqual(parsePieceFolderName(pieceFolderName(piece)), piece);
  }
});

// ---------------------------------------------------------------------------
// Part order
// ---------------------------------------------------------------------------

const CONCERT = [
  "Score", "Piccolo", "Flute 1", "Flute 2", "Oboe", "Bassoon",
  "Clarinet 1", "Clarinet 2", "Clarinet 3", "Bass Clarinet",
  "Alto Sax 1", "Alto Sax 2", "Tenor Sax", "Bari Sax",
  "Trumpet 1", "Trumpet 2", "Trumpet 3", "Horn 1", "Horn 2",
  "Trombone 1", "Trombone 2", "Trombone 3", "Baritone/Euphonium", "Tuba",
  "String Bass", "Piano", "Mallets", "Timpani",
  "Percussion 1", "Percussion 2", "Percussion 3", "Drum Set",
];
const JAZZ = [
  "Score", "Alto Sax 1", "Alto Sax 2", "Tenor Sax 1", "Tenor Sax 2", "Bari Sax",
  "Trumpet 1", "Trumpet 2", "Trumpet 3", "Trumpet 4",
  "Trombone 1", "Trombone 2", "Trombone 3", "Trombone 4",
  "Piano", "Guitar", "Bass", "Drums", "Aux Percussion",
];
const STRINGS = ["Violin 1", "Violin 2", "Viola", "Cello", "Bass"];

test("PART_ORDER: concert and marching band use the concert list", () => {
  assert.deepEqual([...PART_ORDER.CONCERT_BAND], CONCERT);
  assert.deepEqual([...PART_ORDER.MARCHING_BAND], CONCERT);
});

test("PART_ORDER: jazz band uses the jazz list", () => {
  assert.deepEqual([...PART_ORDER.JAZZ_BAND], JAZZ);
});

test("PART_ORDER: orchestra is the concert list minus String Bass, then strings", () => {
  assert.deepEqual(
    [...PART_ORDER.ORCHESTRA],
    [...CONCERT.filter((p) => p !== "String Bass"), ...STRINGS],
  );
});

test("PART_ORDER: miscellaneous, musical and solo/ensemble are concert plus strings without duplicates", () => {
  const expected = [...CONCERT, ...STRINGS];
  for (const cat of ["MISCELLANEOUS", "MUSICAL", "SOLO_ENSEMBLE"] as const) {
    assert.deepEqual([...PART_ORDER[cat]], expected, cat);
    assert.equal(new Set(PART_ORDER[cat]).size, PART_ORDER[cat].length, `${cat} has duplicates`);
  }
});

test("PART_ORDER has an entry for every category and none contain duplicates", () => {
  for (const cat of MUSIC_CATEGORIES) {
    assert.ok(PART_ORDER[cat].length > 0, cat);
    assert.equal(new Set(PART_ORDER[cat]).size, PART_ORDER[cat].length, cat);
  }
});

test("partIndex looks parts up case-insensitively and returns -1 for unknowns", () => {
  assert.equal(partIndex("Score", "CONCERT_BAND"), 0);
  assert.equal(partIndex("Flute 1", "CONCERT_BAND"), 2);
  assert.equal(partIndex("flute 1", "CONCERT_BAND"), 2);
  assert.equal(partIndex("FLUTE 1", "CONCERT_BAND"), 2);
  assert.equal(partIndex("Drum Set", "CONCERT_BAND"), CONCERT.length - 1);
  assert.equal(partIndex("Bass", "JAZZ_BAND"), JAZZ.indexOf("Bass"));
  assert.equal(partIndex("Flute 1", "JAZZ_BAND"), -1);
  assert.equal(partIndex("Kazoo", "CONCERT_BAND"), -1);
  assert.equal(partIndex("", "CONCERT_BAND"), -1);
});

test("sortParts orders by PART_ORDER, dedupes, and keeps unknowns last in original order", () => {
  assert.deepEqual(
    sortParts(["Tuba", "Flute 1", "Score", "Clarinet 2"], "CONCERT_BAND"),
    ["Score", "Flute 1", "Clarinet 2", "Tuba"],
  );
  assert.deepEqual(
    sortParts(["Zither", "Tuba", "Kazoo", "Flute 1", "Tuba", "Flute 1"], "CONCERT_BAND"),
    ["Flute 1", "Tuba", "Zither", "Kazoo"],
  );
  assert.deepEqual(sortParts([], "CONCERT_BAND"), []);
});

test("sortParts dedupes case-insensitively, keeping the first spelling", () => {
  assert.deepEqual(sortParts(["flute 1", "Flute 1", "FLUTE 1"], "CONCERT_BAND"), ["flute 1"]);
});

test("sortParts does not mutate its input", () => {
  const input = ["Tuba", "Score"];
  sortParts(input, "CONCERT_BAND");
  assert.deepEqual(input, ["Tuba", "Score"]);
});

// ---------------------------------------------------------------------------
// Part file names
// ---------------------------------------------------------------------------

test("partFileName formats a single part", () => {
  assert.equal(partFileName("Hey Jude", ["Score"], "CONCERT_BAND"), "Hey Jude - Score.pdf");
});

test("partFileName formats a range from the first to last part in concert order", () => {
  assert.equal(
    partFileName("Hey Jude", ["Clarinet 2", "Flute 1", "Oboe"], "CONCERT_BAND"),
    "Hey Jude - Flute 1 to Clarinet 2.pdf",
  );
  assert.equal(
    partFileName("Hey Jude", ["Trumpet 2", "Trumpet 1"], "JAZZ_BAND"),
    "Hey Jude - Trumpet 1 to Trumpet 2.pdf",
  );
});

test("partFileName collapses duplicate parts before deciding single vs range", () => {
  assert.equal(partFileName("Hey Jude", ["Score", "Score"], "CONCERT_BAND"), "Hey Jude - Score.pdf");
});

test("partFileName uses the canonical spelling of known parts", () => {
  assert.equal(partFileName("Hey Jude", ["flute 1", "OBOE"], "CONCERT_BAND"), "Hey Jude - Flute 1 to Oboe.pdf");
  // unknown parts are kept as typed (trimmed)
  assert.equal(partFileName("Hey Jude", ["  Kazoo "], "CONCERT_BAND"), "Hey Jude - Kazoo.pdf");
});

test("partFileName throws when no parts are picked", () => {
  assert.throws(() => partFileName("Hey Jude", [], "CONCERT_BAND"), { message: "Pick at least one part" });
});

test("partFileName never doubles the .pdf extension", () => {
  assert.equal(partFileName("Hey Jude.pdf", ["Score"], "CONCERT_BAND"), "Hey Jude - Score.pdf");
  assert.equal(partFileName("Hey Jude.PDF", ["Score"], "CONCERT_BAND"), "Hey Jude - Score.pdf");
  assert.equal(partFileName("  Hey Jude  ", ["Score"], "CONCERT_BAND"), "Hey Jude - Score.pdf");
});

test("parsePartFileName parses a range", () => {
  assert.deepEqual(parsePartFileName("Title - Flute 1 to Clarinet 2.pdf"), {
    title: "Title",
    from: "Flute 1",
    to: "Clarinet 2",
  });
});

test("parsePartFileName parses a single part", () => {
  assert.deepEqual(parsePartFileName("Title - Score.pdf"), { title: "Title", from: "Score", to: null });
});

test("parsePartFileName strips .PDF case-insensitively and tolerates a missing extension", () => {
  assert.deepEqual(parsePartFileName("Title - Score.PDF"), { title: "Title", from: "Score", to: null });
  assert.deepEqual(parsePartFileName("Title - Score.Pdf"), { title: "Title", from: "Score", to: null });
  assert.deepEqual(parsePartFileName("Title - Score"), { title: "Title", from: "Score", to: null });
});

test("parsePartFileName matches ' to ' case-insensitively", () => {
  assert.deepEqual(parsePartFileName("Title - Flute 1 TO Clarinet 2.pdf"), {
    title: "Title",
    from: "Flute 1",
    to: "Clarinet 2",
  });
  assert.deepEqual(parsePartFileName("Title - Flute 1 To Clarinet 2.pdf"), {
    title: "Title",
    from: "Flute 1",
    to: "Clarinet 2",
  });
});

test("parsePartFileName splits on the last ' - ' so titles containing ' - ' still parse", () => {
  assert.deepEqual(parsePartFileName("Hey Jude - Lennon-McCartney - Flute 1 to Flute 2.pdf"), {
    title: "Hey Jude - Lennon-McCartney",
    from: "Flute 1",
    to: "Flute 2",
  });
  assert.deepEqual(parsePartFileName("A - B - C - Score.pdf"), { title: "A - B - C", from: "Score", to: null });
});

test("parsePartFileName trims and collapses whitespace", () => {
  assert.deepEqual(parsePartFileName("  Title   -   Flute  1   to   Clarinet   2 .pdf"), {
    title: "Title",
    from: "Flute 1",
    to: "Clarinet 2",
  });
});

test("parsePartFileName returns null when there is no ' - ' or when a side is empty", () => {
  assert.equal(parsePartFileName("Score.pdf"), null);
  assert.equal(parsePartFileName("Title-Score.pdf"), null);
  assert.equal(parsePartFileName(""), null);
  assert.equal(parsePartFileName(" - Score.pdf"), null);
  assert.equal(parsePartFileName("Title - .pdf"), null);
});

test("part file names round-trip through partFileName and parsePartFileName", () => {
  assert.deepEqual(parsePartFileName(partFileName("Hey Jude", ["Score"], "CONCERT_BAND")), {
    title: "Hey Jude",
    from: "Score",
    to: null,
  });
  assert.deepEqual(parsePartFileName(partFileName("Hey Jude - Lennon-McCartney", ["Oboe", "Flute 1"], "CONCERT_BAND")), {
    title: "Hey Jude - Lennon-McCartney",
    from: "Flute 1",
    to: "Oboe",
  });
});

test("sortPartFiles orders by the 'from' part and puts unparseable files last alphabetically", () => {
  const files = [
    { name: "Title - Tuba.pdf", id: "tuba" },
    { name: "zebra.pdf", id: "zebra" },
    { name: "Title - Flute 1 to Flute 2.pdf", id: "flutes" },
    { name: "apple.pdf", id: "apple" },
    { name: "Title - Score.pdf", id: "score" },
    { name: "Title - Kazoo.pdf", id: "kazoo" },
    { name: "Title - Clarinet 1.pdf", id: "cl1" },
  ];
  const sorted = sortPartFiles(files, "CONCERT_BAND");
  assert.deepEqual(
    sorted.map((f) => f.id),
    ["score", "flutes", "cl1", "tuba", "kazoo", "apple", "zebra"],
  );
  // returns the same objects, does not mutate the input array
  assert.equal(sorted[0], files[4]);
  assert.deepEqual(files.map((f) => f.id), ["tuba", "zebra", "flutes", "apple", "score", "kazoo", "cl1"]);
});

test("sortPartFiles respects the category's part order", () => {
  const files = [{ name: "T - Bass.pdf" }, { name: "T - Trumpet 4.pdf" }, { name: "T - Alto Sax 1.pdf" }];
  assert.deepEqual(
    sortPartFiles(files, "JAZZ_BAND").map((f) => f.name),
    ["T - Alto Sax 1.pdf", "T - Trumpet 4.pdf", "T - Bass.pdf"],
  );
  assert.deepEqual(sortPartFiles([], "JAZZ_BAND"), []);
});

// ---------------------------------------------------------------------------
// suggestParts
// ---------------------------------------------------------------------------

function checkSuggestions(category: MusicCategory, cases: Array<[string, string[]]>) {
  for (const [file, expected] of cases) {
    assert.deepEqual(suggestParts(file, category), expected, `${category}: ${file}`);
  }
}

test("suggestParts maps messy concert band filenames to parts", () => {
  checkSuggestions("CONCERT_BAND", [
    ["Fl1.pdf", ["Flute 1"]],
    ["Fl.pdf", ["Flute 1", "Flute 2"]],
    ["Cl 2.pdf", ["Clarinet 2"]],
    ["Tpt2.pdf", ["Trumpet 2"]],
    ["asax1.pdf", ["Alto Sax 1"]],
    ["Bari.pdf", ["Bari Sax"]],
    ["Tbn 1-2.pdf", ["Trombone 1", "Trombone 2"]],
    ["Perc.pdf", ["Percussion 1", "Percussion 2", "Percussion 3"]],
    ["score.pdf", ["Score"]],
    ["Hn.pdf", ["Horn 1", "Horn 2"]],
    ["Euph.pdf", ["Baritone/Euphonium"]],
    ["Bsn.pdf", ["Bassoon"]],
    ["Ob.pdf", ["Oboe"]],
    ["Picc.pdf", ["Piccolo"]],
    ["BCl.pdf", ["Bass Clarinet"]],
    ["TSax.pdf", ["Tenor Sax"]],
    ["Tuba.pdf", ["Tuba"]],
    ["Drums.pdf", ["Drum Set"]],
    ["Piano.pdf", ["Piano"]],
    ["Timp.pdf", ["Timpani"]],
    ["Mallets.pdf", ["Mallets"]],
    ["Bass.pdf", ["String Bass"]],
  ]);
});

test("suggestParts handles multi-word aliases, ranges and title prefixes", () => {
  checkSuggestions("CONCERT_BAND", [
    ["Bass Cl.pdf", ["Bass Clarinet"]],
    ["Full Score.pdf", ["Score"]],
    ["Bari Horn.pdf", ["Baritone/Euphonium"]],
    ["String Bass.pdf", ["String Bass"]],
    ["Alto Sax 2.pdf", ["Alto Sax 2"]],
    ["Trumpet 1-3.pdf", ["Trumpet 1", "Trumpet 2", "Trumpet 3"]],
    ["Hey Jude - Fl 1.pdf", ["Flute 1"]],
    ["Hey Jude - Flute 1 to Clarinet 2.pdf", ["Flute 1", "Clarinet 2"]],
    ["1st Clarinet.pdf", ["Clarinet 1"]],
    ["Fl 1 & Ob.pdf", ["Flute 1", "Oboe"]],
    ["FLUTE_2.PDF", ["Flute 2"]],
  ]);
});

test("suggestParts only returns parts that exist in the category", () => {
  checkSuggestions("CONCERT_BAND", [
    ["Gtr.pdf", []],
    ["Vln 1.pdf", []],
    ["Trumpet 4.pdf", ["Trumpet 1", "Trumpet 2", "Trumpet 3"]],
    ["Ob 1.pdf", ["Oboe"]],
  ]);
  checkSuggestions("JAZZ_BAND", [
    ["Fl1.pdf", []],
    ["Hn.pdf", []],
    ["Timp.pdf", []],
  ]);
});

test("suggestParts maps jazz band filenames, using jazz-specific part names", () => {
  checkSuggestions("JAZZ_BAND", [
    ["Drums.pdf", ["Drums"]],
    ["Bass.pdf", ["Bass"]],
    ["Gtr.pdf", ["Guitar"]],
    ["TSax.pdf", ["Tenor Sax 1", "Tenor Sax 2"]],
    ["asax1.pdf", ["Alto Sax 1"]],
    ["Tpt2.pdf", ["Trumpet 2"]],
    ["Tpt 4.pdf", ["Trumpet 4"]],
    ["Tbn 1-2.pdf", ["Trombone 1", "Trombone 2"]],
    ["Bari.pdf", ["Bari Sax"]],
    ["Piano.pdf", ["Piano"]],
    ["score.pdf", ["Score"]],
    ["aux.pdf", ["Aux Percussion"]],
    ["Aux Perc.pdf", ["Aux Percussion"]],
    ["Perc.pdf", ["Aux Percussion"]],
  ]);
});

test("suggestParts maps orchestra filenames including strings", () => {
  checkSuggestions("ORCHESTRA", [
    ["Vln 1.pdf", ["Violin 1"]],
    ["Vln.pdf", ["Violin 1", "Violin 2"]],
    ["Vla.pdf", ["Viola"]],
    ["Vc.pdf", ["Cello"]],
    ["Bass.pdf", ["Bass"]],
    ["String Bass.pdf", ["Bass"]],
    ["Fl.pdf", ["Flute 1", "Flute 2"]],
    ["Timp.pdf", ["Timpani"]],
    ["Drums.pdf", ["Drum Set"]],
  ]);
});

test("suggestParts returns results in concert order without duplicates", () => {
  assert.deepEqual(suggestParts("Tuba Fl1 Score Fl1.pdf", "CONCERT_BAND"), ["Score", "Flute 1", "Tuba"]);
});

test("suggestParts returns [] when nothing matches", () => {
  assert.deepEqual(suggestParts("random.pdf", "CONCERT_BAND"), []);
  assert.deepEqual(suggestParts("", "CONCERT_BAND"), []);
  assert.deepEqual(suggestParts("IMG_20240101.jpg", "CONCERT_BAND"), []);
  assert.deepEqual(suggestParts("Hey Jude.pdf", "CONCERT_BAND"), []);
});
