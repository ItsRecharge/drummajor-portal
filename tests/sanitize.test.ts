import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml, absolutizeImageSrc } from "../src/lib/sanitize.ts";

test("keeps img with app-hosted src, strips other attributes", () => {
  assert.equal(
    sanitizeHtml('<img src="/i/abc123" onerror="alert(1)" class="x">'),
    '<img src="/i/abc123" style="max-width:100%" />',
  );
});

test("keeps img with https src", () => {
  assert.equal(
    sanitizeHtml('<img src="https://example.com/pic.png">'),
    '<img src="https://example.com/pic.png" style="max-width:100%" />',
  );
});

test("drops img with http, javascript, or missing src", () => {
  assert.equal(sanitizeHtml('<img src="http://example.com/pic.png">'), "");
  assert.equal(sanitizeHtml('<img src="javascript:alert(1)">'), "");
  assert.equal(sanitizeHtml("<img>"), "");
});

test("still strips script tags entirely", () => {
  assert.equal(sanitizeHtml("<p>hi</p><script>alert(1)</script>"), "<p>hi</p>");
});

test("existing formatting tags still pass", () => {
  assert.equal(sanitizeHtml("<p><b>bold</b> and <i>italic</i></p>"), "<p><b>bold</b> and <i>italic</i></p>");
});

test("ignores lookalike attributes before the real src", () => {
  assert.equal(
    sanitizeHtml('<img xsrc="https://evil.example/x.png" src="/i/legit">'),
    '<img src="/i/legit" style="max-width:100%" />',
  );
});

test("ignores lookalike attributes before the real href", () => {
  assert.equal(
    sanitizeHtml('<a data-href="https://evil.example" href="https://good.example">x</a>'),
    '<a href="https://good.example" target="_blank" rel="noopener noreferrer">x</a>',
  );
});

test("absolutizeImageSrc rewrites only app-relative /i/ srcs", () => {
  assert.equal(
    absolutizeImageSrc(
      '<img src="/i/abc" /><img src="https://x.com/y.png" />',
      "https://portal.example.com/",
    ),
    '<img src="https://portal.example.com/i/abc" /><img src="https://x.com/y.png" />',
  );
});
