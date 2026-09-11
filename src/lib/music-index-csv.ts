// Pure CSV shaping for the Drive folder's index.csv (dependency-free so it's
// unit-testable). The index predates the portal and is one row PER FILE with
// curated columns; we keep that schema, preserve curated values, and only
// add/remove rows as files come and go.

import { parseCsv } from "./csv.ts";

export const INDEX_FILE_NAME = "index.csv";

export const INDEX_COLUMNS = [
  "category",
  "folder",
  "file",
  "part",
  "song",
  "composer",
  "arranger",
  "source",
  "confidence",
  "note",
] as const;

export type IndexRow = Record<(typeof INDEX_COLUMNS)[number], string>;

// What the DB knows about one part file.
export type DbFileRow = {
  category: string; // category folder name as it appears in Drive
  folder: string; // piece folder name
  file: string; // file name
  partGuess: string; // from the file name, "" when it doesn't follow the convention
  song: string; // piece title
  composer: string;
  arranger: string;
};

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// RFC 4180: comma separated, CRLF line endings, quotes doubled inside quoted cells.
export function toCsv(rows: IndexRow[]): string {
  const lines = [INDEX_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) lines.push(INDEX_COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function parseIndexCsv(text: string): IndexRow[] {
  const { header, rows } = parseCsv(text);
  if (header.length === 0) return [];
  const idx = new Map(header.map((h, i) => [h, i]));
  return rows.map((cells) => {
    const row = {} as IndexRow;
    for (const c of INDEX_COLUMNS) {
      const i = idx.get(c);
      row[c] = i == null ? "" : (cells[i] ?? "").trim();
    }
    return row;
  });
}

const rowKey = (folder: string, file: string) => `${folder}/${file}`;

// Merge the DB's view of the files with the existing index: curated cells win
// when present, gaps are filled from the DB, rows for files that no longer
// exist are dropped, new files get fresh rows. Output is sorted for stable diffs.
export function mergeIndex(existingCsv: string, files: DbFileRow[]): IndexRow[] {
  const existing = new Map(parseIndexCsv(existingCsv).map((r) => [rowKey(r.folder, r.file), r]));
  const out: IndexRow[] = files.map((f) => {
    const ex = existing.get(rowKey(f.folder, f.file));
    return {
      category: f.category,
      folder: f.folder,
      file: f.file,
      part: ex?.part || f.partGuess,
      song: ex?.song || f.song,
      composer: ex?.composer || f.composer,
      arranger: ex?.arranger || f.arranger,
      source: ex?.source || "",
      confidence: ex?.confidence || (f.partGuess ? "high" : ""),
      note: ex?.note || "",
    };
  });
  return out.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.folder.localeCompare(b.folder) || a.file.localeCompare(b.file),
  );
}
