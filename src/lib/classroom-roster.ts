/**
 * Parse a Google Classroom "People" page saved with the browser's
 * "Save as → Webpage, Complete" and extract the student roster.
 *
 * Runs server-side only (node-html-parser; no DOM globals).
 */
import { parse, NodeType, type HTMLElement, type Node } from "node-html-parser";

export type ClassroomStudent = { name: string; email: string };
export type ClassroomSkipped = { name: string; email: string; reason: string };
export type ClassroomRoster = {
  className: string | null;
  expectedCount: number | null;
  students: ClassroomStudent[];
  skipped: ClassroomSkipped[];
  warnings: string[];
};

/** Domains that identify a student account (portal sign-up allowlist lives in allowlist.ts). */
export const STUDENT_DOMAINS: readonly string[] = ["wpsstudent.com"];

const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const HIDDEN_STYLE_RE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
const EMAIL_LABEL_RE = /^\s*email\s+/i;
const TITLE_RE = /^People in (.+?) - Classroom$/;
const EXACT_COUNT_RE = /^(\d+)\s+students?$/i;
const LOOSE_COUNT_RE = /(\d+)\s+students?\b/i;

const REASON_INVALID = "Invalid email";
const REASON_DOMAIN = "Not a student email (staff or other domain)";
const REASON_DUPLICATE = "Duplicate in this file";

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function isStudentEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return EMAIL_RE.test(e) && STUDENT_DOMAINS.includes(emailDomain(e));
}

// ---- DOM helpers -------------------------------------------------------------

function isElement(n: Node): n is HTMLElement {
  return n.nodeType === NodeType.ELEMENT_NODE;
}

function attr(el: HTMLElement, name: string): string {
  return el.getAttribute(name) ?? "";
}

function isHiddenElement(el: HTMLElement): boolean {
  if (HIDDEN_STYLE_RE.test(attr(el, "style"))) return true;
  return attr(el, "aria-hidden").trim().toLowerCase() === "true";
}

/** Visible = neither the element nor any ancestor is hidden via inline style or aria-hidden. */
function isVisible(el: HTMLElement): boolean {
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentNode) {
    if (isHiddenElement(cur)) return false;
  }
  return true;
}

function isAncestorOf(ancestor: HTMLElement, node: HTMLElement): boolean {
  for (let cur: HTMLElement | null = node.parentNode; cur; cur = cur.parentNode) {
    if (cur === ancestor) return true;
  }
  return false;
}

/** Nearest ancestor (excluding `el` itself) with role="listitem". */
function closestListItem(el: HTMLElement): HTMLElement | null {
  for (let cur: HTMLElement | null = el.parentNode; cur; cur = cur.parentNode) {
    if (attr(cur, "role").trim().toLowerCase() === "listitem") return cur;
  }
  return null;
}

/** Depth-first walk over text nodes, skipping aria-hidden subtrees and tooltips. */
function firstTextNode(el: HTMLElement, pred: (text: string) => boolean): string | null {
  for (const child of el.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const t = normalizeWs(child.text);
      if (t && pred(t)) return t;
    } else if (isElement(child)) {
      if (attr(child, "aria-hidden").trim().toLowerCase() === "true") continue;
      if (attr(child, "role").trim().toLowerCase() === "tooltip") continue;
      const found = firstTextNode(child, pred);
      if (found !== null) return found;
    }
  }
  return null;
}

function isRosterHeading(h: HTMLElement): boolean {
  const t = normalizeWs(h.text);
  return t === "Classmates" || t === "Students";
}

// ---- extraction ----------------------------------------------------------------

function cleanName(raw: string): string {
  return normalizeWs(raw)
    .replace(/\s*\(invited\)\s*$/i, "")
    .trim();
}

function extractName(row: HTMLElement, email: string): string {
  const nameSpan = row.querySelectorAll("span").find((s) => attr(s, "id").startsWith("rtsc-"));
  let name = nameSpan ? cleanName(nameSpan.text) : "";
  if (!name) {
    // Never mistake the email link label / tooltip ("Email x@y") for a name.
    const text = firstTextNode(
      row,
      (t) => !EMAIL_LABEL_RE.test(t) && !t.toLowerCase().includes(email),
    );
    name = text ? cleanName(text) : "";
  }
  if (!name) {
    const at = email.indexOf("@");
    name = at > 0 ? email.slice(0, at) : email;
  }
  return name;
}

function extractClassName(doc: HTMLElement): string | null {
  const title = doc.querySelector("title");
  if (!title) return null;
  const m = TITLE_RE.exec(normalizeWs(title.text));
  return m ? m[1].trim() : null;
}

function extractExpectedCount(root: HTMLElement): number | null {
  // Prefer a text node that is exactly "N students" (the count badge under the heading),
  // so "2 students" inside a class description cannot win over the real count.
  const exact = firstTextNode(root, (t) => EXACT_COUNT_RE.test(t));
  const m = exact ? EXACT_COUNT_RE.exec(exact) : LOOSE_COUNT_RE.exec(normalizeWs(root.text));
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function chooseRoot(doc: HTMLElement, warnings: string[]): HTMLElement {
  const wrappers = doc
    .querySelectorAll("c-wiz")
    .filter((w) => w.querySelectorAll("h2").some(isRosterHeading));
  // A wrapper that merely contains another candidate view is not a view itself.
  const candidates = wrappers.filter((w) => !wrappers.some((o) => o !== w && isAncestorOf(w, o)));

  if (candidates.length === 0) {
    warnings.push("Could not find a class view wrapper; parsed the whole page.");
    return doc;
  }

  const visible = candidates.filter(isVisible);
  const root = visible.length > 0 ? visible[visible.length - 1] : candidates[candidates.length - 1];
  if (candidates.length > 1) {
    warnings.push(
      `This save contains ${candidates.length} class views; used the ${visible.length > 0 ? "visible" : "last"} one.`,
    );
  }
  if (visible.length === 0) {
    warnings.push("No visible class view found; used the last one.");
  }
  return root;
}

export function parseClassroomPeople(html: string): ClassroomRoster {
  const warnings: string[] = [];
  const doc = parse(html, {
    lowerCaseTagName: false,
    comment: false,
    blockTextElements: { script: false, style: false },
  });

  const className = extractClassName(doc);
  const root = chooseRoot(doc, warnings);
  const expectedCount = extractExpectedCount(root);

  const students: ClassroomStudent[] = [];
  const skipped: ClassroomSkipped[] = [];
  const seen = new Set<string>();

  for (const row of root.querySelectorAll('[role="listitem"]')) {
    const link = row
      .querySelectorAll("a[aria-label]")
      .find((a) => EMAIL_LABEL_RE.test(attr(a, "aria-label")) && closestListItem(a) === row);
    if (!link) continue;

    const email = attr(link, "aria-label").replace(EMAIL_LABEL_RE, "").trim().toLowerCase();
    const name = extractName(row, email);

    if (!EMAIL_RE.test(email)) {
      skipped.push({ name, email, reason: REASON_INVALID });
    } else if (!STUDENT_DOMAINS.includes(emailDomain(email))) {
      skipped.push({ name, email, reason: REASON_DOMAIN });
    } else if (seen.has(email)) {
      skipped.push({ name, email, reason: REASON_DUPLICATE });
    } else {
      seen.add(email);
      students.push({ name, email });
    }
  }

  if (
    expectedCount !== null &&
    students.length !== expectedCount &&
    students.length !== expectedCount - 1
  ) {
    warnings.push(`The page says ${expectedCount} students but ${students.length} were found.`);
  }
  if (students.length === 0) {
    warnings.push("No students were found in this page.");
  }

  return { className, expectedCount, students, skipped, warnings };
}
