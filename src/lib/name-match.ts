// Matching a typed name to the roster for QR check-in. The student types their
// name "as it appears on Google Classroom"; we forgive case, accents, spacing
// and punctuation but nothing else — a first name alone or a typo is a miss,
// and the roster is never suggested back to the public page. Pure so it runs
// under node:test.

// Letters and digits only, lowercase, accents stripped: "José O'Brien-Smith Jr."
// and "jose obrien smith jr" both become "joseobriensmithjr".
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export type NameMatch<T> = { ok: true; contact: T } | { ok: false; reason: "NOT_FOUND" | "AMBIGUOUS" };

// Exactly one roster contact must normalize to the typed name. Two contacts
// with the same normalized name (twins, a duplicate import) are AMBIGUOUS so a
// drum major decides.
export function matchContact<T extends { id: string; name: string }>(
  typed: string,
  roster: readonly T[],
): NameMatch<T> {
  const key = normalizeName(typed);
  if (!key) return { ok: false, reason: "NOT_FOUND" };
  const hits = roster.filter((c) => normalizeName(c.name) === key);
  if (hits.length === 1) return { ok: true, contact: hits[0] };
  return { ok: false, reason: hits.length === 0 ? "NOT_FOUND" : "AMBIGUOUS" };
}
