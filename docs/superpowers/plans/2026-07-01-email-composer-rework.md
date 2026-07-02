# Email Composer Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the announcements composer read like a normal email client: seeded editable templates, To-chips, searchable music dropdown (sent as Drive folder links), and inline image upload embedded in emails.

**Architecture:** Images are stored as bytes in a new `EmailImage` table, served publicly at `/i/[id]` (same trust model as the `/t/[token].gif` tracking pixel), inserted into the rich-text body as relative `<img src="/i/…">`, and rewritten to absolute URLs at send time. Templates are seeded once into the existing (currently empty) `AnnouncementTemplate` table and new ones are created from the composer via the existing-but-unwired `saveTemplateAction`. The composer is reorganized into an email-like layout; all form field names stay the same so server actions barely change.

**Tech Stack:** Next.js 16.2.9 App Router (read `node_modules/next/dist/docs/` if an API surprises you — this version has breaking changes), React 19, Prisma 7 (PGlite in dev via `scripts/dev-db.mjs`), zod 4, nodemailer, Tailwind 4, shadcn/base-ui components, `node:test` for unit tests.

**Key context for a fresh engineer:**

- Dev server MUST run with an empty `DATABASE_URL`: `DATABASE_URL= npm run dev` (otherwise it tries a real Postgres and 500s). Same for the migration script.
- Spec: `docs/superpowers/specs/2026-07-01-email-composer-rework-design.md`
- The send pipeline already turns attached Library folders into Drive links (`src/lib/announce.ts` → `buildMusicAttachments`). Do not touch that logic.
- `src/lib/form.ts` defines `ActionState`/`parseForm`/`emptyState` used by every server action; `src/components/field.tsx` is the standard labeled input.
- Dialogs follow the controlled pattern from `src/app/(app)/notes/board.tsx`: `<Dialog open={x} onOpenChange={setX}><DialogContent>…` — there is no `DialogTrigger` usage in this codebase.
- There is currently NO test infrastructure. Task 1 bootstraps `node --test` (Node v22.23.1 strips TypeScript types natively).

---

### Task 1: Test bootstrap + sanitizer image support

**Files:**
- Modify: `package.json` (add `test` script)
- Modify: `tsconfig.json` (add `allowImportingTsExtensions`)
- Modify: `src/lib/sanitize.ts`
- Test: `tests/sanitize.test.ts`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/email-composer-rework
```

- [ ] **Step 2: Add the test script and tsconfig flag**

In `package.json` `"scripts"`, after `"lint": "eslint"` add:

```json
"test": "node --test tests/"
```

In `tsconfig.json` `"compilerOptions"`, add (needed so `tsc --noEmit` accepts the explicit `.ts` import extension that Node's type stripping requires):

```json
"allowImportingTsExtensions": true
```

- [ ] **Step 3: Write the failing tests**

Create `tests/sanitize.test.ts`:

```ts
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

test("absolutizeImageSrc rewrites only app-relative /i/ srcs", () => {
  assert.equal(
    absolutizeImageSrc(
      '<img src="/i/abc" /><img src="https://x.com/y.png" />',
      "https://portal.example.com/",
    ),
    '<img src="https://portal.example.com/i/abc" /><img src="https://x.com/y.png" />',
  );
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `absolutizeImageSrc` is not exported and the img tests fail (img currently stripped).
Troubleshooting: if Node complains about type stripping, prepend the flag: `node --experimental-strip-types --test tests/`.

- [ ] **Step 5: Implement sanitizer changes**

In `src/lib/sanitize.ts`:

Add `"img"` to the `ALLOWED` set:

```ts
const ALLOWED = new Set([
  "b", "strong", "i", "em", "u", "p", "br", "ul", "ol", "li", "a", "h3", "h4", "blockquote", "img",
]);
```

Add `safeSrc` next to `safeHref` (same pattern; app-relative `/i/` or https only):

```ts
function safeSrc(attrs: string): string | null {
  const m = attrs.match(/src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!m) return null;
  const val = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  if (/^(https:|\/i\/)/i.test(val)) return escapeAttr(val);
  return null;
}
```

In the tag-rewriting `replace` callback, handle `img` before the generic re-emit (an `img` without a safe src is useless, so drop it; also drop stray `</img>`):

```ts
    if (name === "img") {
      if (slash === "/") return "";
      const src = safeSrc(attrs);
      return src ? `<img src="${src}" style="max-width:100%" />` : "";
    }
```

Place this AFTER the `if (slash === "/") return `</${name}>`;` line would fire — so actually insert the img branch BEFORE the closing-tag branch. Final callback order:

```ts
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, slash: string, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (name === "img") {
      if (slash === "/") return "";
      const src = safeSrc(attrs);
      return src ? `<img src="${src}" style="max-width:100%" />` : "";
    }
    if (slash === "/") return `</${name}>`;
    if (name === "a") {
      const href = safeHref(attrs);
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : "<a>";
    }
    return `<${name}>`;
  });
```

At the bottom of the file, add the send-time rewriter (dependency-free string helper — this file is the home for pure HTML utilities):

```ts
// Rewrite app-relative inline-image srcs ("/i/<id>") to absolute URLs so emails
// composed against localhost or an old domain always use the base URL current at
// send time. https srcs pass through untouched.
export function absolutizeImageSrc(html: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return html.replace(/src="\/i\//g, `src="${base}/i/`);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json src/lib/sanitize.ts tests/sanitize.test.ts
git commit -m "feat: allow inline images in sanitizer + send-time src absolutizer"
```

---

### Task 2: EmailImage model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/3_email_image/migration.sql`

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`, after the `AnnouncementTemplate` model:

```prisma
// Uploaded inline images for announcement bodies, served publicly at /i/[id].
// Public by design: email recipients load them unauthenticated; the random cuid
// is the only handle (same trust model as the tracking pixel).
model EmailImage {
  id        String   @id @default(cuid())
  mime      String
  data      Bytes
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Write the migration**

Create `prisma/migrations/3_email_image/migration.sql` (handwritten, matching the numbered-directory pattern of `2_library_merge`):

```sql
-- Inline images embedded in announcement emails, served at /i/[id].
CREATE TABLE "EmailImage" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailImage_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 3: Apply to the dev PGlite DB and regenerate the client**

```bash
DATABASE_URL= node scripts/dev-db.mjs
npx prisma generate
```

Expected: `[dev-db] Applied migration 3_email_image to PGlite (.pglite).` and a clean generate into `src/generated/prisma`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors (`prisma.emailImage` now exists on the client).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/3_email_image/migration.sql src/generated/prisma
git commit -m "feat: EmailImage model for inline announcement images"
```

(If `src/generated/prisma` is gitignored, commit only the first two paths — check `git status` first.)

---

### Task 3: Public image route + upload action

**Files:**
- Create: `src/app/i/[id]/route.ts`
- Modify: `src/app/(app)/announcements/actions.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/i/[id]/route.ts`, modeled on `src/app/t/[token]/route.ts` (note the `params: Promise<…>` shape — Next 16 requires awaiting params):

```ts
import { prisma } from "@/lib/prisma";

// Inline announcement images. Public (no auth) by design — recipients load these
// from their inboxes; the random cuid is the only handle. Content is immutable
// once created, so cache hard.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await prisma.emailImage.findUnique({ where: { id } });
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 2: Add the upload server action**

In `src/app/(app)/announcements/actions.ts`, after `saveTemplateAction`:

```ts
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Stores an uploaded body image and returns its app-relative URL for the editor.
// The sanitizer only admits "/i/" and https img srcs, so this is the sole path
// for getting an uploaded image into an announcement.
export async function uploadImageAction(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireRole(...COMPOSE_ROLES);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file selected." };
  if (!IMAGE_MIMES.has(file.type)) return { error: "Use a PNG, JPEG, GIF, or WebP image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be 4 MB or smaller." };
  const data = new Uint8Array(await file.arrayBuffer());
  const img = await prisma.emailImage.create({ data: { mime: file.type, data } });
  return { url: `/i/${img.id}` };
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/i/[id]/route.ts" "src/app/(app)/announcements/actions.ts"
git commit -m "feat: image upload action + public /i/[id] serving route"
```

---

### Task 4: RichText image button

**Files:**
- Modify: `src/components/rich-text.tsx`

- [ ] **Step 1: Extend RichText with an optional image-upload capability**

Replace the full contents of `src/components/rich-text.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Lightweight rich-text editor: a contenteditable surface with a small toolbar,
// syncing its HTML into a hidden input so it posts with the surrounding form.
// Output is sanitized server-side (src/lib/sanitize.ts) before storage/send.
// When `onImageUpload` is provided, an Image button uploads a picked file and
// embeds the returned URL at the caret.
export function RichText({
  name,
  defaultValue = "",
  onChange,
  onImageUpload,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  onImageUpload?: (file: File) => Promise<{ url?: string; error?: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The caret position is lost when the native file dialog steals focus, so we
  // snapshot the selection on mousedown and restore it before inserting.
  const savedRange = useRef<Range | null>(null);
  const [html, setHtml] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function sync() {
    const next = ref.current?.innerHTML ?? "";
    setHtml(next);
    onChange?.(next);
  }

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }

  function addLink() {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onImageUpload) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await onImageUpload(file);
      if (res.error || !res.url) {
        setUploadError(res.error ?? "Upload failed.");
        return;
      }
      restoreSelection();
      exec("insertImage", res.url);
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const btn = "px-2 py-1 h-8";
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("bold")}>
          <b>B</b>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("italic")}>
          <i>I</i>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("underline")}>
          <u>U</u>
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("insertUnorderedList")}>
          • List
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={() => exec("insertOrderedList")}>
          1. List
        </Button>
        <Button type="button" size="sm" variant="outline" className={btn} onClick={addLink}>
          Link
        </Button>
        {onImageUpload ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={btn}
              disabled={uploading}
              onMouseDown={saveSelection}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Image"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={pickImage}
            />
          </>
        ) : null}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        className="min-h-40 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: defaultValue }}
      />
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors. (Existing RichText call sites omit `onImageUpload`, which is optional — they keep compiling.)

- [ ] **Step 3: Commit**

```bash
git add src/components/rich-text.tsx
git commit -m "feat: image upload button in rich-text editor"
```

---

### Task 5: Seeded default templates

**Files:**
- Create: `src/lib/announcement-templates.ts`
- Modify: `src/app/(app)/announcements/new/page.tsx`

- [ ] **Step 1: Create the seeding module**

Create `src/lib/announcement-templates.ts`:

```ts
import { prisma } from "@/lib/prisma";

// Starter templates seeded once (only while the table is empty) so the composer's
// template dropdown is useful out of the box. Users edit the loaded copy per-send;
// new templates come from the composer's "Save as template" button. Seeding only
// on empty means we never resurrect templates the user has since deleted.
const DEFAULT_TEMPLATES = [
  {
    name: "Rehearsal Reminder",
    subject: "Rehearsal reminder — [date]",
    bodyHtml:
      "<p>Hi everyone,</p><p>Reminder that we have rehearsal on <b>[day, date]</b> from <b>[start]–[end]</b> at <b>[location]</b>.</p><ul><li>Arrive 15 minutes early to set up</li><li>Bring your music and a pencil</li><li>Water and sunscreen recommended</li></ul><p>See you there!</p>",
  },
  {
    name: "Performance Day",
    subject: "Performance day details — [event]",
    bodyHtml:
      "<p>Hi everyone,</p><p>Here is everything you need for <b>[event]</b> on <b>[date]</b>:</p><ul><li><b>Call time:</b> [time], [location]</li><li><b>Uniform:</b> [uniform details]</li><li><b>Bring:</b> instrument, music, water</li><li><b>Pickup:</b> [time and place]</li></ul><p>Questions? Reply to this email.</p>",
  },
  {
    name: "General Update",
    subject: "Band update — [topic]",
    bodyHtml: "<p>Hi everyone,</p><p>[Write your update here.]</p><p>Thanks,<br />[Your name]</p>",
  },
];

export async function ensureDefaultTemplates(): Promise<void> {
  const count = await prisma.announcementTemplate.count();
  if (count > 0) return;
  await prisma.announcementTemplate.createMany({ data: DEFAULT_TEMPLATES });
}
```

- [ ] **Step 2: Call it from the compose page**

In `src/app/(app)/announcements/new/page.tsx`, add the import:

```ts
import { ensureDefaultTemplates } from "@/lib/announcement-templates";
```

and directly after the `await ensureBuiltInGroups();` line add (best-effort — a seed failure must never block composing):

```ts
await ensureDefaultTemplates().catch(() => {});
```

- [ ] **Step 3: Verify in the running app**

```bash
DATABASE_URL= npm run dev
```

Load `http://localhost:3000/announcements/new` (log in as an admin). Expected: "Start from a template" dropdown lists Rehearsal Reminder / Performance Day / General Update; picking one fills subject and body. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/announcement-templates.ts "src/app/(app)/announcements/new/page.tsx"
git commit -m "feat: seed default announcement templates"
```

---

### Task 6: MusicPicker component

**Files:**
- Create: `src/app/(app)/announcements/music-picker.tsx`

- [ ] **Step 1: Create the searchable multi-select**

Create `src/app/(app)/announcements/music-picker.tsx`. It posts the same `musicIds` field the checkbox list used, so `actions.ts` needs no changes:

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

export type MusicOption = { id: string; title: string };

// Searchable multi-select for attaching Library pieces to an announcement.
// Selected pieces render as removable chips; each chip carries a hidden
// musicIds input so the selection posts with the surrounding form.
export function MusicPicker({ options }: { options: MusicOption[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MusicOption[]>([]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? options
        .filter((o) => o.title.toLowerCase().includes(q) && !selected.some((s) => s.id === o.id))
        .slice(0, 8)
    : [];

  function add(option: MusicOption) {
    setSelected((prev) => [...prev, option]);
    setQuery("");
  }

  return (
    <div className="grid gap-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
            >
              {s.title}
              <button
                type="button"
                aria-label={`Remove ${s.title}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSelected((prev) => prev.filter((p) => p.id !== s.id))}
              >
                <X className="size-3.5" />
              </button>
              <input type="hidden" name="musicIds" value={s.id} />
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library…"
          aria-label="Search music"
        />
        {matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => add(m)}
                >
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors (component not yet imported anywhere — that's Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/announcements/music-picker.tsx"
git commit -m "feat: searchable music picker with chips"
```

---

### Task 7: Save-as-template dialog + composer rework

**Files:**
- Create: `src/app/(app)/announcements/save-template-dialog.tsx`
- Modify: `src/app/(app)/announcements/composer.tsx` (full rewrite; `new/page.tsx` is untouched — the `MusicOption` re-export keeps its imports valid)

- [ ] **Step 1: Create the dialog**

Create `src/app/(app)/announcements/save-template-dialog.tsx`, using the controlled Dialog pattern from `src/app/(app)/notes/board.tsx`. It snapshots the composer's live subject/body into hidden inputs inside its own form (the DialogContent renders in a portal, so this form never nests inside the composer's form in the DOM):

```tsx
"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { emptyState } from "@/lib/form";
import { saveTemplateAction } from "./actions";

// Saves the composer's current subject/body as a named reusable template.
export function SaveTemplateDialog({ subject, bodyHtml }: { subject: string; bodyHtml: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveTemplateAction, emptyState);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Save as template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={formAction} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Save as template</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Saves the current subject and message so you can start from them next time.
            </p>
            <Field
              label="Template name"
              name="templateName"
              error={state.fieldErrors?.templateName}
              required
            />
            <input type="hidden" name="subject" value={subject} />
            <input type="hidden" name="bodyHtml" value={bodyHtml} />
            {state.success ? (
              <p className="text-sm text-muted-foreground">{state.message}</p>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Rewrite the composer**

Replace the full contents of `src/app/(app)/announcements/composer.tsx` with:

```tsx
"use client";

import { useActionState, useState } from "react";
import { emptyState } from "@/lib/form";
import { Field } from "@/components/field";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { composeAction, uploadImageAction } from "./actions";
import { MusicPicker, type MusicOption } from "./music-picker";
import { SaveTemplateDialog } from "./save-template-dialog";

export type GroupOption = { id: string; name: string; count: number };
export type { MusicOption };
export type TemplateOption = { id: string; subject: string; bodyHtml: string; name: string };

// Email-client-style composer: template picker, To-chips, subject, rich body
// with inline images, music attachments, and send/schedule/draft actions.
export function Composer({
  groups,
  music,
  templates,
}: {
  groups: GroupOption[];
  music: MusicOption[];
  templates: TemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(composeAction, emptyState);
  // Subject and body are tracked in state so templates can fill them and the
  // Save-as-template dialog can snapshot them mid-edit.
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyInit, setBodyInit] = useState("");
  const [bodyKey, setBodyKey] = useState(0);

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.bodyHtml);
    setBodyInit(tpl.bodyHtml);
    setBodyKey((k) => k + 1); // remount the editor with the new initial HTML
  }

  async function handleImageUpload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    return uploadImageAction(fd);
  }

  return (
    <form action={formAction} className="grid gap-5">
      {templates.length > 0 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="template">Start from a template</Label>
          <select
            id="template"
            defaultValue=""
            onChange={(e) => applyTemplate(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">— None —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">To</legend>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <label
              key={g.id}
              className="cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input type="checkbox" name="groupIds" value={g.id} className="sr-only" />
              {g.name} ({g.count})
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          aria-invalid={!!state.fieldErrors?.subject}
        />
        {state.fieldErrors?.subject ? (
          <p className="text-sm text-destructive">{state.fieldErrors.subject}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label>Message</Label>
        <RichText
          key={`body-${bodyKey}`}
          name="bodyHtml"
          defaultValue={bodyInit}
          onChange={setBody}
          onImageUpload={handleImageUpload}
        />
        {state.fieldErrors?.bodyHtml ? (
          <p className="text-sm text-destructive">{state.fieldErrors.bodyHtml}</p>
        ) : null}
      </div>

      {music.length > 0 ? (
        <div className="grid gap-1.5">
          <Label>Attach music (optional)</Label>
          <MusicPicker options={music} />
        </div>
      ) : null}

      <Field
        label="Schedule for later (optional)"
        name="scheduledAt"
        type="datetime-local"
        error={state.fieldErrors?.scheduledAt}
      />

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? "Working…" : "Send now"}
        </Button>
        <Button type="submit" name="intent" value="schedule" variant="outline" disabled={pending}>
          Schedule
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
          Save draft
        </Button>
        <SaveTemplateDialog subject={subject} bodyHtml={body} />
      </div>
    </form>
  );
}
```

Note: `MusicOption` moved to `music-picker.tsx` but is re-exported from `composer.tsx`, so `new/page.tsx` keeps working without import changes. Verify `new/page.tsx` still compiles; if it imported `MusicOption` directly, the re-export covers it.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Manual verify in the dev app**

```bash
DATABASE_URL= npm run dev
```

On `/announcements/new`: template dropdown fills subject+body; To-chips toggle (filled style when selected); music search shows matches, adds chips, ✕ removes; Image button uploads a PNG and it appears in the editor; Save as template opens dialog, saving shows "Template saved." and the new template appears in the dropdown after reload. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/announcements/composer.tsx" "src/app/(app)/announcements/save-template-dialog.tsx"
git commit -m "feat: email-style composer with To chips, music picker, save-as-template"
```

---

### Task 8: Send path — absolutize image srcs + label music section

**Files:**
- Modify: `src/lib/announce.ts`
- Modify: `src/lib/email.ts:47`

- [ ] **Step 1: Absolutize inline image srcs at send time**

In `src/lib/announce.ts`, add to the imports:

```ts
import { absolutizeImageSrc } from "@/lib/sanitize";
```

In `processQueue`, change the `announcementEmail` call (currently `bodyHtml: ann.bodyHtml`) to:

```ts
        const html = announcementEmail({
          bodyHtml: absolutizeImageSrc(ann.bodyHtml, appBaseUrl()),
          pixelUrl: `${appBaseUrl()}/t/${d.trackingToken}.gif`,
          linksHtml: music.linksHtml,
        });
```

- [ ] **Step 2: Label the music links block**

In `src/lib/email.ts` inside `announcementEmail`, change the heading text `Attached music` to `🎵 Music`:

```ts
  const links = opts.linksHtml
    ? `<hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0" /><p style="font-weight:600;margin:0 0 8px">🎵 Music</p>${opts.linksHtml}`
    : "";
```

- [ ] **Step 3: Type-check, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean/passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/announce.ts src/lib/email.ts
git commit -m "feat: absolute image URLs at send time + labeled music section"
```

---

### Task 9: Full verification

- [ ] **Step 1: Clean build**

```bash
rm -rf .next && npm run build
```

Expected: build succeeds; `/i/[id]` appears in the route list.

- [ ] **Step 2: Unit tests + lint**

```bash
npm test && npm run lint && npx tsc --noEmit
```

Expected: 6/6 tests pass, 0 lint errors (pre-existing warnings OK), 0 type errors.

- [ ] **Step 3: E2E smoke (dev server)**

```bash
DATABASE_URL= npm run dev
```

1. `/announcements/new` → pick "Rehearsal Reminder" → fields fill.
2. Toggle a To chip, attach a music piece via search, upload an image into the body.
3. Save draft → reopen list → announcement present.
4. Open the uploaded image's URL directly (`/i/<id>` from the editor HTML, e.g. via devtools) → image bytes render.
5. If SMTP is configured in this environment: send to a test group and confirm the received email shows the image (absolute URL) and a "🎵 Music" section with a Drive folder link. If SMTP is not configured, verify instead that the stored `bodyHtml` contains the sanitized `<img src="/i/…">` and skip the live-send check.

- [ ] **Step 4: Commit any stragglers, then request review**

```bash
git status
```

Expected: clean tree. Use superpowers:requesting-code-review / superpowers:finishing-a-development-branch to wrap up.
