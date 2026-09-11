// Pure CSV shaping for index.csv (kept dependency-free so it's unit-testable).

export const INDEX_FILE_NAME = "index.csv";

export type IndexRow = {
  category: string;
  title: string;
  creditType: string;
  credit: string;
  parts: string;
  files: number;
  link: string;
  updated: string; // YYYY-MM-DD
};

const HEADER = ["Category", "Title", "Credit Type", "Composer/Arranger", "Parts", "Files", "Drive Link", "Updated"];

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180: comma separated, CRLF line endings, quotes doubled inside quoted cells.
export function toCsv(rows: IndexRow[]): string {
  const lines = [HEADER.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.category, r.title, r.creditType, r.credit, r.parts, r.files, r.link, r.updated].map(csvCell).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
