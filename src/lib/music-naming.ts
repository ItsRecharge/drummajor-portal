/**
 * Naming conventions for the Google Drive "Band Music Database" folder.
 *
 *   Band Music Database/
 *     <category folder>/            e.g. "Concert Band"
 *       <piece folder>/             e.g. "Sing, Sing, Sing - arr. Bill Holcombe"
 *         <part file>.pdf           e.g. "Sing, Sing, Sing - Flute 1 to Flute 2.pdf"
 *
 * Pure functions only: no I/O, no Prisma. `MusicCategory` mirrors the member
 * names of the (future) Prisma enum 1:1 so it can be mapped directly.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const MUSIC_CATEGORIES = [
  "CONCERT_BAND",
  "JAZZ_BAND",
  "MARCHING_BAND",
  "MISCELLANEOUS",
  "MUSICAL",
  "ORCHESTRA",
  "SOLO_ENSEMBLE",
] as const;

export type MusicCategory = (typeof MUSIC_CATEGORIES)[number];

/** Drive folder name for each category. */
// Exactly as the folders are named in the band's "Band Music Database" Drive.
export const CATEGORY_FOLDERS: Record<MusicCategory, string> = {
  CONCERT_BAND: "Concert Band",
  JAZZ_BAND: "Jazz Band",
  MARCHING_BAND: "Marching Band",
  MISCELLANEOUS: "Misc. (Non-Music)",
  MUSICAL: "Musical (Pit)",
  ORCHESTRA: "Orchestra",
  SOLO_ENSEMBLE: "Solo & Ensemble",
};

/** Human-facing label for each category. */
export const CATEGORY_LABELS: Record<MusicCategory, string> = {
  CONCERT_BAND: "Concert Band",
  JAZZ_BAND: "Jazz Band",
  MARCHING_BAND: "Marching Band",
  MISCELLANEOUS: "Misc. (Non-Music)",
  MUSICAL: "Musical (Pit)",
  ORCHESTRA: "Orchestra",
  SOLO_ENSEMBLE: "Solo & Ensemble",
};

// Other spellings that should still resolve to a category (older folder
// names, hand-typed variants). Keys are compared after alnumKey().
const CATEGORY_ALIASES: Record<string, MusicCategory> = {
  misc: "MISCELLANEOUS",
  miscellaneous: "MISCELLANEOUS",
  miscnonmusic: "MISCELLANEOUS",
  nonmusic: "MISCELLANEOUS",
  musical: "MUSICAL",
  musicalpit: "MUSICAL",
  pit: "MUSICAL",
  soloensemble: "SOLO_ENSEMBLE",
  soloandensemble: "SOLO_ENSEMBLE",
  concert: "CONCERT_BAND",
  jazz: "JAZZ_BAND",
  marching: "MARCHING_BAND",
};

function byCategory<T>(build: (category: MusicCategory) => T): Record<MusicCategory, T> {
  const out = {} as Record<MusicCategory, T>;
  for (const category of MUSIC_CATEGORIES) out[category] = build(category);
  return out;
}

/** Lowercase and drop every non-alphanumeric character. */
function alnumKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CATEGORY_BY_FOLDER_KEY: ReadonlyMap<string, MusicCategory> = new Map([
  ...MUSIC_CATEGORIES.map((category): [string, MusicCategory] => [alnumKey(CATEGORY_FOLDERS[category]), category]),
  ...Object.entries(CATEGORY_ALIASES).map(([k, v]): [string, MusicCategory] => [alnumKey(k), v]),
]);

/**
 * Match a Drive folder name to a category. Case-insensitive and ignores
 * punctuation/whitespace, so "Solo/Ensemble", "solo ensemble" and
 * "Solo & Ensemble" all match SOLO_ENSEMBLE, and known aliases ("Misc.",
 * "Musical (Pit)") resolve too; anything else returns null.
 */
export function categoryFromFolderName(name: string): MusicCategory | null {
  const key = alnumKey(name);
  if (!key) return null;
  return CATEGORY_BY_FOLDER_KEY.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Piece folder names
// ---------------------------------------------------------------------------

export type CreditType = "ARRANGER" | "COMPOSER";

export type PieceName = {
  title: string;
  credit: string | null;
  creditType: CreditType | null;
};

const SEPARATOR = " - ";
const ARRANGER_PREFIX = /^arr\.?\s+(.+)$/i;

/** Collapse runs of whitespace to a single space and trim the ends. */
function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse "Title - arr. Name" / "Title - Name" / "Title". Splits on the FIRST
 * " - " so hyphenated names ("Lennon-McCartney") stay intact.
 */
export function parsePieceFolderName(name: string): PieceName {
  // Collapse whitespace but do not trim yet so a dangling "Title - " still
  // finds its separator.
  const collapsed = name.replace(/\s+/g, " ");
  const at = collapsed.indexOf(SEPARATOR);
  if (at === -1) return { title: collapsed.trim(), credit: null, creditType: null };

  const title = collapsed.slice(0, at).trim();
  const rest = collapsed.slice(at + SEPARATOR.length).trim();
  if (!rest) return { title, credit: null, creditType: null };

  const arranger = ARRANGER_PREFIX.exec(rest);
  if (arranger) return { title, credit: arranger[1].trim(), creditType: "ARRANGER" };
  return { title, credit: rest, creditType: "COMPOSER" };
}

/** Inverse of {@link parsePieceFolderName}. */
export function pieceFolderName(piece: PieceName): string {
  const title = squash(piece.title);
  const credit = piece.credit ? squash(piece.credit) : "";
  if (!credit) return title;
  return piece.creditType === "ARRANGER"
    ? `${title}${SEPARATOR}arr. ${credit}`
    : `${title}${SEPARATOR}${credit}`;
}

// ---------------------------------------------------------------------------
// Part order
// ---------------------------------------------------------------------------

const CONCERT: readonly string[] = [
  "Score",
  "Piccolo",
  "Flute 1",
  "Flute 2",
  "Oboe",
  "Bassoon",
  "Clarinet 1",
  "Clarinet 2",
  "Clarinet 3",
  "Bass Clarinet",
  "Alto Sax 1",
  "Alto Sax 2",
  "Tenor Sax",
  "Bari Sax",
  "Trumpet 1",
  "Trumpet 2",
  "Trumpet 3",
  "Horn 1",
  "Horn 2",
  "Trombone 1",
  "Trombone 2",
  "Trombone 3",
  "Baritone/Euphonium",
  "Tuba",
  "String Bass",
  "Piano",
  "Mallets",
  "Timpani",
  "Percussion 1",
  "Percussion 2",
  "Percussion 3",
  "Drum Set",
];

const JAZZ: readonly string[] = [
  "Score",
  "Alto Sax 1",
  "Alto Sax 2",
  "Tenor Sax 1",
  "Tenor Sax 2",
  "Bari Sax",
  "Trumpet 1",
  "Trumpet 2",
  "Trumpet 3",
  "Trumpet 4",
  "Trombone 1",
  "Trombone 2",
  "Trombone 3",
  "Trombone 4",
  "Piano",
  "Guitar",
  "Bass",
  "Drums",
  "Aux Percussion",
];

const STRINGS: readonly string[] = ["Violin 1", "Violin 2", "Viola", "Cello", "Bass"];

function uniqueConcat(...lists: readonly (readonly string[])[]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const part of list) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
  }
  return out;
}

const ORCHESTRA = uniqueConcat(
  CONCERT.filter((part) => part !== "String Bass"),
  STRINGS,
);
const CONCERT_AND_STRINGS = uniqueConcat(CONCERT, STRINGS);

/** Concert (score) order of parts for each category. */
export const PART_ORDER: Record<MusicCategory, readonly string[]> = {
  CONCERT_BAND: CONCERT,
  JAZZ_BAND: JAZZ,
  MARCHING_BAND: CONCERT,
  MISCELLANEOUS: CONCERT_AND_STRINGS,
  MUSICAL: CONCERT_AND_STRINGS,
  ORCHESTRA,
  SOLO_ENSEMBLE: CONCERT_AND_STRINGS,
};

/** Normalised lookup key for a part name (case- and whitespace-insensitive). */
function partKey(part: string): string {
  return squash(part).toLowerCase();
}

const PART_INDEX: Record<MusicCategory, ReadonlyMap<string, number>> = byCategory(
  (category) => new Map(PART_ORDER[category].map((part, index) => [partKey(part), index])),
);

/** Index of `part` in `PART_ORDER[category]` (case-insensitive), or -1. */
export function partIndex(part: string, category: MusicCategory): number {
  return PART_INDEX[category].get(partKey(part)) ?? -1;
}

/** The canonical spelling from PART_ORDER when known, else the trimmed input. */
function canonicalPart(part: string, category: MusicCategory): string {
  const index = partIndex(part, category);
  return index === -1 ? squash(part) : PART_ORDER[category][index];
}

/**
 * Sort parts into concert order. Unknown parts go last, keeping their original
 * relative order. Duplicates (case-insensitive) and blank entries are dropped;
 * the first spelling of a duplicate wins.
 */
export function sortParts(parts: string[], category: MusicCategory): string[] {
  const seen = new Set<string>();
  const entries: { part: string; index: number; position: number }[] = [];
  for (const part of parts) {
    const key = partKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ part, index: partIndex(part, category), position: entries.length });
  }
  entries.sort((a, b) => {
    const ai = a.index === -1 ? Number.MAX_SAFE_INTEGER : a.index;
    const bi = b.index === -1 ? Number.MAX_SAFE_INTEGER : b.index;
    return ai - bi || a.position - b.position;
  });
  return entries.map((entry) => entry.part);
}

// ---------------------------------------------------------------------------
// Part file names
// ---------------------------------------------------------------------------

const PDF_EXTENSION = /\s*\.pdf\s*$/i;
const RANGE = /^(.+?)\s+to\s+(.+)$/i;

/**
 * Build the file name for a part PDF covering `parts`:
 *   one part  → "Title - Flute 1.pdf"
 *   several   → "Title - Flute 1 to Clarinet 2.pdf" (first and last in concert order)
 */
export function partFileName(title: string, parts: string[], category: MusicCategory): string {
  const sorted = sortParts(parts, category).map((part) => canonicalPart(part, category));
  if (sorted.length === 0) throw new Error("Pick at least one part");

  const base = squash(title).replace(PDF_EXTENSION, "").trim();
  const range =
    sorted.length === 1 ? sorted[0] : `${sorted[0]} to ${sorted[sorted.length - 1]}`;
  return `${base}${SEPARATOR}${range}.pdf`;
}

export type PartRange = { title: string; from: string; to: string | null };

/**
 * Parse "Title - Flute 1 to Clarinet 2.pdf" or "Title - Score.pdf". Splits on
 * the LAST " - " so titles that themselves contain " - " still parse. Returns
 * null when there is no separator or either side is empty.
 */
export function parsePartFileName(fileName: string): PartRange | null {
  const collapsed = fileName.replace(/\s+/g, " ").replace(PDF_EXTENSION, "");
  const at = collapsed.lastIndexOf(SEPARATOR);
  if (at === -1) return null;

  const title = collapsed.slice(0, at).trim();
  const spec = collapsed.slice(at + SEPARATOR.length).trim();
  if (!title || !spec) return null;

  const range = RANGE.exec(spec);
  if (range) return { title, from: range[1].trim(), to: range[2].trim() };
  return { title, from: spec, to: null };
}

/**
 * Sort part files into concert order by their starting part. Files whose part
 * is not in PART_ORDER come next, then files that do not follow the naming
 * convention at all; both trailing groups are alphabetical by name.
 */
export function sortPartFiles<T extends { name: string }>(files: T[], category: MusicCategory): T[] {
  const keyed = files.map((file, position) => {
    const parsed = parsePartFileName(file.name);
    const index = parsed ? partIndex(parsed.from, category) : -1;
    const group = index !== -1 ? 0 : parsed ? 1 : 2;
    return { file, index, group, position };
  });
  keyed.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === 0) return a.index - b.index || a.position - b.position;
    return (
      a.file.name.localeCompare(b.file.name, "en", { numeric: true }) || a.position - b.position
    );
  });
  return keyed.map((entry) => entry.file);
}

// ---------------------------------------------------------------------------
// suggestParts: best-effort guess from a messy original file name
// ---------------------------------------------------------------------------

/**
 * Alias table: lowercase, whitespace-separated aliases → candidate base part
 * names, in priority order. The first candidate present in the category's
 * PART_ORDER wins, which is how "drums" becomes "Drum Set" in concert band but
 * "Drums" in jazz, and "bass" becomes "String Bass" where that exists and
 * "Bass" otherwise. Multi-word aliases always beat shorter ones at the same
 * position ("bass cl" → Bass Clarinet, not Bass).
 */
type AliasEntry = readonly [aliases: readonly string[], bases: readonly string[]];

const PART_ALIASES: readonly AliasEntry[] = [
  [["score", "full score", "conductor", "conductor score", "cond"], ["Score"]],
  [["picc", "piccolo", "pic"], ["Piccolo"]],
  [["fl", "flt", "flute", "flutes"], ["Flute"]],
  [["ob", "oboe"], ["Oboe"]],
  [["bsn", "bn", "bassoon"], ["Bassoon"]],
  [["cl", "clt", "clar", "clarinet", "clarinets"], ["Clarinet"]],
  [["bcl", "bass cl", "bass clar", "bass clarinet"], ["Bass Clarinet"]],
  [["asax", "alto", "altosax", "alto sax", "alto saxophone"], ["Alto Sax"]],
  [["tsax", "tenor", "tenorsax", "tenor sax", "tenor saxophone"], ["Tenor Sax"]],
  [["bari", "bsax", "barisax", "bari sax", "baritone sax", "baritone saxophone"], ["Bari Sax"]],
  [["tpt", "trp", "trpt", "tp", "trumpet", "trumpets", "cornet"], ["Trumpet"]],
  [["hn", "fhn", "horn", "horns", "f horn", "french horn", "mello", "mellophone"], ["Horn"]],
  [["tbn", "trb", "tb", "tbone", "bone", "trombone", "trombones", "bass trombone", "bass tbn"], ["Trombone"]],
  [["euph", "euphonium", "baritone", "bari horn", "baritone horn"], ["Baritone/Euphonium"]],
  [["tuba", "tubas", "sousa", "sousaphone"], ["Tuba"]],
  [["sb", "db", "string bass", "str bass", "double bass", "contrabass"], ["String Bass", "Bass"]],
  [["bass", "electric bass", "bass guitar"], ["String Bass", "Bass"]],
  [["pno", "pn", "piano", "keys", "keyboard"], ["Piano"]],
  [
    ["mallets", "mallet", "mlt", "bells", "glock", "glockenspiel", "xylo", "xylophone", "marimba", "vibes", "vibraphone"],
    ["Mallets"],
  ],
  [["timp", "timps", "timpani"], ["Timpani"]],
  [["perc", "percussion", "snare", "cymbals", "bass drum"], ["Percussion", "Aux Percussion"]],
  [["ds", "drumset", "drum set", "drums", "drum", "drum kit"], ["Drum Set", "Drums"]],
  [["gtr", "gt", "guitar"], ["Guitar"]],
  [["aux", "aux perc", "aux percussion", "auxiliary percussion"], ["Aux Percussion"]],
  [["vln", "vn", "violin", "violins"], ["Violin"]],
  [["vla", "viola", "violas"], ["Viola"]],
  [["vc", "vcl", "cello", "cellos", "violoncello"], ["Cello"]],
];

const ALIAS_LOOKUP: ReadonlyMap<string, readonly string[]> = new Map(
  PART_ALIASES.flatMap(([aliases, bases]) => aliases.map((alias) => [alias, bases] as const)),
);
const MAX_ALIAS_WORDS = Math.max(...PART_ALIASES.flatMap(([aliases]) => aliases.map((a) => a.split(" ").length)));

const MIN_PART_NUMBER = 1;
const MAX_PART_NUMBER = 4;

/**
 * Lowercase, drop the extension, turn "1st" into "1", split letters from
 * digits ("fl1" → "fl 1"), mark numeric ranges ("1-2" → "1~2") and drop all
 * other punctuation.
 */
function tokenizeFileName(fileName: string): string[] {
  const cleaned = fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/(\d)\s*[-–—]\s*(\d)/g, "$1~$2")
    .replace(/[^a-z0-9~]+/g, " ");
  return cleaned.split(" ").filter(Boolean);
}

/** Part numbers selected by a token: "2" → [2], "1~3" → [1, 2, 3], else null. */
function partNumbersFrom(token: string): number[] | null {
  const single = /^(\d)$/.exec(token);
  if (single) {
    const n = Number(single[1]);
    return n >= MIN_PART_NUMBER && n <= MAX_PART_NUMBER ? [n] : null;
  }
  const range = /^(\d)~(\d)$/.exec(token);
  if (range) {
    const lo = Math.max(MIN_PART_NUMBER, Math.min(Number(range[1]), Number(range[2])));
    const hi = Math.min(MAX_PART_NUMBER, Math.max(Number(range[1]), Number(range[2])));
    const numbers: number[] = [];
    for (let n = lo; n <= hi; n++) numbers.push(n);
    return numbers.length ? numbers : null;
  }
  return null;
}

function matchAlias(tokens: string[], at: number): { length: number; bases: readonly string[] } | null {
  for (let length = Math.min(MAX_ALIAS_WORDS, tokens.length - at); length >= 1; length--) {
    const bases = ALIAS_LOOKUP.get(tokens.slice(at, at + length).join(" "));
    if (bases) return { length, bases };
  }
  return null;
}

/**
 * Resolve a base part name ("Flute") plus optional numbers to concrete parts in
 * `order`. Numbered variants ("Flute 1", "Flute 2") are picked by number; with
 * no (matching) number every numbered variant is returned; a base with no
 * numbered variants resolves to its plain entry ("Oboe", "Ob 1" included).
 */
function resolveBase(bases: readonly string[], numbers: number[], order: readonly string[]): string[] {
  for (const base of bases) {
    const prefix = `${base.toLowerCase()} `;
    const numbered = order.filter(
      (part) => part.toLowerCase().startsWith(prefix) && /^\d+$/.test(part.slice(prefix.length)),
    );
    const plain = order.find((part) => part.toLowerCase() === base.toLowerCase());
    if (numbered.length === 0 && !plain) continue;

    if (numbers.length > 0) {
      const picked = numbered.filter((part) => numbers.includes(Number(part.slice(prefix.length))));
      if (picked.length > 0) return picked;
    }
    return numbered.length > 0 ? numbered : [plain as string];
  }
  return [];
}

/**
 * Guess which parts a messy original file name covers ("Fl1.pdf" → ["Flute 1"],
 * "Tbn 1-2.pdf" → ["Trombone 1", "Trombone 2"], "Hn.pdf" → ["Horn 1", "Horn 2"]).
 * Only parts present in `PART_ORDER[category]` are returned, in concert order.
 */
export function suggestParts(originalFileName: string, category: MusicCategory): string[] {
  const tokens = tokenizeFileName(originalFileName);
  const order = PART_ORDER[category];
  const found: string[] = [];

  // Numbers seen immediately before an alias ("1st Clarinet") apply to it when
  // nothing follows the alias; any other token clears them.
  let leadingNumbers: number[] = [];
  let at = 0;
  while (at < tokens.length) {
    const alias = matchAlias(tokens, at);
    if (!alias) {
      const numbers = partNumbersFrom(tokens[at]);
      leadingNumbers = numbers ? [...leadingNumbers, ...numbers] : [];
      at += 1;
      continue;
    }

    at += alias.length;
    let numbers: number[] = [];
    while (at < tokens.length) {
      const next = partNumbersFrom(tokens[at]);
      if (!next) break;
      numbers = [...numbers, ...next];
      at += 1;
    }
    if (numbers.length === 0) numbers = leadingNumbers;
    leadingNumbers = [];

    found.push(...resolveBase(alias.bases, numbers, order));
  }

  return sortParts(found, category);
}
