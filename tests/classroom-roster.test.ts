import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClassroomPeople,
  isStudentEmail,
  STUDENT_DOMAINS,
} from "../src/lib/classroom-roster.ts";

// ---- fixture helpers -------------------------------------------------------

const TITLE = "People in &#39;26-&#39;27 Jazz Band / Marching Band - Classroom";

function emailLink(email: string): string {
  const enc = email.replace("@", "%40");
  return (
    `<a jsname="hSRGPd" class="pYTkkf-Bz112c-mRLv6" ` +
    `href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=${enc}&amp;authuser=0" ` +
    `target="_blank" aria-label="Email ${email}"></a>` +
    `<div class="ne2Ple-oshW8e-J9fEaf" role="tooltip">Email ${email}</div>`
  );
}

type StudentOpts = { nameHtml?: string; id?: string };

/** A student row as Classroom renders it (rtsc- name span + hidden "(invited)" span + email link). */
function student(name: string | null, email: string, opts: StudentOpts = {}): string {
  const nameHtml =
    opts.nameHtml ??
    (name === null
      ? ""
      : `<span class="y4ihN YVvGBb" id="rtsc-878246360853-${opts.id ?? "177240002"}">${name}</span>`);
  return (
    `<div role="listitem" class="P6qqFf umNowf">` +
    `<div class="avatar"><img alt="" src="./x_files/photo.jpg"></div>` +
    `<div class="who">${nameHtml}<span aria-hidden="true" class="ED5QLc ofWlVd">(invited)</span></div>` +
    `<div class="actions">${emailLink(email)}</div>` +
    `</div>`
  );
}

/** A teacher row: plain <li> (not role=listitem) with an "Options for teacher" button and an email link. */
function teacher(name: string, email: string): string {
  return (
    `<li class="teacher"><div><span class="nm">${name}</span></div>` +
    `<button aria-label="Options for teacher ${name}"></button>${emailLink(email)}</li>`
  );
}

type ViewOpts = {
  id?: string;
  hidden?: boolean;
  style?: string;
  heading?: "Classmates" | "Students";
  count?: number | string;
  teachers?: string;
  students: string;
  description?: string;
};

function view(opts: ViewOpts): string {
  const id = opts.id ?? "ucc-419";
  let attrs: string;
  if (opts.style !== undefined) {
    attrs = ` style="${opts.style}"`;
  } else if (opts.hidden) {
    attrs =
      ` style="visibility: hidden; opacity: 0; position: fixed; inset: 0px 0px -191.676px; display: none;"` +
      ` aria-hidden="true"`;
  } else {
    attrs = ` style="visibility: visible; opacity: 1;"`;
  }
  const heading = opts.heading ?? "Classmates";
  const count = opts.count === undefined ? "" : `<div class="cnt">${opts.count}</div>`;
  return (
    `<c-wiz c-wiz="" jsrenderer="BZn5fd" data-view-id="${id}"${attrs}>` +
    `<div class="desc">${opts.description ?? ""}</div>` +
    `<h2 class="hd">Teachers</h2><ul class="tl">${opts.teachers ?? ""}</ul>` +
    `<h2 class="hd">${heading}</h2>${count}` +
    `<div role="list">${opts.students}</div>` +
    `</c-wiz>`
  );
}

function page(body: string, title: string | null = TITLE): string {
  const titleTag = title === null ? "" : `<title>${title}</title>`;
  // The script deliberately contains roster-looking markup: it must be dropped, not parsed.
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${titleTag}` +
    `<style>.ED5QLc{display:none}</style>` +
    `<script>var junk = "<h2>Students</h2><div role=\\"listitem\\"></div>";</script>` +
    `</head><body>${body}</body></html>`
  );
}

// ---- tests -------------------------------------------------------------------

test("(a) extracts name + email in document order, drops the (invited) span, lowercases email", () => {
  const html = page(
    view({
      count: "3 students",
      students:
        student("Ada Lovelace", "07001111@wpsstudent.com") +
        student("Alan Turing", "07002222@WPSStudent.com", { id: "177240003" }),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [
    { name: "Ada Lovelace", email: "07001111@wpsstudent.com" },
    { name: "Alan Turing", email: "07002222@wpsstudent.com" },
  ]);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.warnings, []);
  for (const s of r.students) assert.ok(!s.name.includes("(invited)"));
});

test("(b) two c-wiz views, first hidden: only the visible view's students are used", () => {
  const html = page(
    view({
      id: "ucc-316",
      hidden: true,
      count: "3 students",
      students:
        student("Old One", "07009991@wpsstudent.com") +
        student("Old Two", "07009992@wpsstudent.com"),
    }) +
      view({
        id: "ucc-419",
        count: "2 students",
        students: student("New One", "07001111@wpsstudent.com"),
      }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "New One", email: "07001111@wpsstudent.com" }]);
  assert.equal(r.expectedCount, 2);
  assert.deepEqual(r.skipped, []);
  assert.ok(
    r.warnings.some((w) => /2 class views/.test(w) && /visible/.test(w)),
    `expected a multi-view warning, got ${JSON.stringify(r.warnings)}`,
  );
});

test("(b2) hidden detection tolerates missing spaces and no aria-hidden; visible-first order does not matter", () => {
  const html = page(
    view({
      id: "ucc-1",
      count: "2 students",
      students: student("Current", "07001111@wpsstudent.com"),
    }) +
      view({
        id: "ucc-2",
        style: "visibility:hidden;opacity:0;display:none",
        count: "9 students",
        students: student("Stale", "07009999@wpsstudent.com"),
      }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "Current", email: "07001111@wpsstudent.com" }]);
  assert.equal(r.expectedCount, 2);
});

test("(b3) no visible view: falls back to the last one with a warning", () => {
  const html = page(
    view({ id: "ucc-1", hidden: true, count: "2 students", students: student("A", "07000001@wpsstudent.com") }) +
      view({ id: "ucc-2", hidden: true, count: "2 students", students: student("B", "07000002@wpsstudent.com") }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "B", email: "07000002@wpsstudent.com" }]);
  assert.ok(r.warnings.some((w) => /No visible class view/.test(w)));
});

test("(c) teacher <li> rows are ignored; staff emails inside a listitem are skipped by domain", () => {
  const html = page(
    view({
      count: "2 students",
      teachers:
        teacher("Mr. Band Director", "director@winchesterps.org") +
        teacher("Ms. Assistant", "assistant@winchesterps.org"),
      students:
        `<div role="listitem"><span id="rtsc-1-1">Stray Staff</span>${emailLink("staff@winchesterps.org")}</div>` +
        student("Real Student", "07001111@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "Real Student", email: "07001111@wpsstudent.com" }]);
  assert.deepEqual(r.skipped, [
    { name: "Stray Staff", email: "staff@winchesterps.org", reason: "Not a student email (staff or other domain)" },
  ]);
  // plain <li> teachers appear nowhere
  const all = [...r.students, ...r.skipped].map((x) => x.email);
  assert.ok(!all.includes("director@winchesterps.org"));
  assert.ok(!all.includes("assistant@winchesterps.org"));
});

test("(d) emails in description text outside listitems are ignored (even with an Email aria-label)", () => {
  const html = page(
    view({
      count: "2 students",
      description:
        `Questions? <a href="https://mail.google.com/mail/?view=cm&amp;to=07005555%40wpsstudent.com">07005555@wpsstudent.com</a> (Melia) or ` +
        `<a href="https://mail.google.com/mail/?view=cm&amp;to=07006666%40wpsstudent.com" aria-label="Email 07006666@wpsstudent.com">section leader</a>`,
      students: student("Only Student", "07001111@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "Only Student", email: "07001111@wpsstudent.com" }]);
  assert.deepEqual(r.skipped, []);
});

test("(e) teacher-saved page uses a 'Students' heading and an exact count", () => {
  const html = page(
    view({
      heading: "Students",
      count: "2 students",
      students:
        student("One", "07000001@wpsstudent.com") + student("Two", "07000002@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.equal(r.students.length, 2);
  assert.equal(r.expectedCount, 2);
  assert.deepEqual(r.warnings, []);
});

test("(f) no c-wiz wrapper at all: parses the whole page and warns", () => {
  const html = page(
    `<div><h2>Classmates</h2><div>1 student</div>` +
      student("Solo", "07000001@wpsstudent.com") +
      `</div>`,
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "Solo", email: "07000001@wpsstudent.com" }]);
  assert.equal(r.expectedCount, 1);
  assert.ok(r.warnings.some((w) => /Could not find a class view wrapper/.test(w)));
});

test("(g) duplicate email in the same file is skipped, first occurrence kept", () => {
  const html = page(
    view({
      count: "3 students",
      students:
        student("First Copy", "07001111@wpsstudent.com") +
        student("Second Copy", "07001111@WPSSTUDENT.com") +
        student("Other", "07002222@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [
    { name: "First Copy", email: "07001111@wpsstudent.com" },
    { name: "Other", email: "07002222@wpsstudent.com" },
  ]);
  assert.deepEqual(r.skipped, [
    { name: "Second Copy", email: "07001111@wpsstudent.com", reason: "Duplicate in this file" },
  ]);
});

test("(h) className comes from <title> with entities decoded", () => {
  const r = parseClassroomPeople(page(view({ count: "1 student", students: "" })));
  assert.equal(r.className, "'26-'27 Jazz Band / Marching Band");

  const amp = parseClassroomPeople(
    page(view({ count: "1 student", students: "" }), "People in Rock &amp; Roll - Classroom"),
  );
  assert.equal(amp.className, "Rock & Roll");

  assert.equal(parseClassroomPeople(page(view({ students: "" }), null)).className, null);
  assert.equal(parseClassroomPeople(page(view({ students: "" }), "Something else")).className, null);
});

test("(h) expectedCount and the count-mismatch warning", () => {
  const five = (n: number) => {
    let s = "";
    for (let i = 1; i <= n; i++) s += student(`S${i}`, `0700000${i}@wpsstudent.com`);
    return page(view({ count: "5 students", students: s }));
  };
  const off2 = parseClassroomPeople(five(3));
  assert.equal(off2.expectedCount, 5);
  assert.ok(off2.warnings.includes("The page says 5 students but 3 were found."));

  const off1 = parseClassroomPeople(five(4));
  assert.equal(off1.expectedCount, 5);
  assert.deepEqual(off1.warnings, []);

  const exact = parseClassroomPeople(five(5));
  assert.deepEqual(exact.warnings, []);

  const single = parseClassroomPeople(page(view({ count: "1 student", students: student("A", "07000001@wpsstudent.com") })));
  assert.equal(single.expectedCount, 1);

  const none = parseClassroomPeople(page(view({ students: student("A", "07000001@wpsstudent.com") })));
  assert.equal(none.expectedCount, null);
  assert.deepEqual(none.warnings, []);
});

test("(h2) zero students found produces a warning", () => {
  const r = parseClassroomPeople(page(view({ count: "1 student", students: "" })));
  assert.deepEqual(r.students, []);
  assert.ok(r.warnings.length >= 1);
});

test("(i) name falls back to the first text node, then to the email local part", () => {
  const html = page(
    view({
      count: "3 students",
      students:
        student(null, "07001111@wpsstudent.com", { nameHtml: `<span class="nm">  Jane   Doe (invited)</span>` }) +
        student(null, "07002222@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [
    { name: "Jane Doe", email: "07001111@wpsstudent.com" },
    { name: "07002222", email: "07002222@wpsstudent.com" },
  ]);
});

test("(k) malformed email in the label is skipped as invalid", () => {
  const html = page(
    view({
      count: "2 students",
      students:
        `<div role="listitem"><span id="rtsc-1-1">Broken Row</span><a aria-label="Email not-an-email" href="#"></a></div>` +
        student("Fine", "07001111@wpsstudent.com"),
    }),
  );
  const r = parseClassroomPeople(html);
  assert.deepEqual(r.students, [{ name: "Fine", email: "07001111@wpsstudent.com" }]);
  assert.deepEqual(r.skipped, [{ name: "Broken Row", email: "not-an-email", reason: "Invalid email" }]);
});

test("(j) isStudentEmail and STUDENT_DOMAINS", () => {
  assert.deepEqual([...STUDENT_DOMAINS], ["wpsstudent.com"]);
  assert.equal(isStudentEmail("07001111@wpsstudent.com"), true);
  assert.equal(isStudentEmail("  07001111@WPSStudent.COM "), true);
  assert.equal(isStudentEmail("teacher@winchesterps.org"), false);
  assert.equal(isStudentEmail("x@notwpsstudent.com"), false);
  assert.equal(isStudentEmail("x@wpsstudent.com.evil.org"), false);
  assert.equal(isStudentEmail("wpsstudent.com"), false);
  assert.equal(isStudentEmail(""), false);
});
