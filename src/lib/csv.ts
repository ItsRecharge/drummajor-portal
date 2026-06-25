// Minimal CSV parser — no dependency. Handles quoted fields with embedded commas,
// escaped double-quotes (""), and CRLF/LF line endings. Blank lines are skipped.

export type ParsedCsv = {
  header: string[];
  rows: string[][];
};

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Drop fully-blank rows (single empty field from a stray newline).
    if (!(row.length === 1 && row[0].trim() === "")) records.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush trailing field/row (file without final newline).
  if (field.length > 0 || row.length > 0) pushRow();
  return records;
}

// Parse CSV text into a normalized header (lowercased, trimmed) plus rows.
export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text);
  if (records.length === 0) return { header: [], rows: [] };
  const header = records[0].map((h) => h.trim().toLowerCase());
  return { header, rows: records.slice(1) };
}
