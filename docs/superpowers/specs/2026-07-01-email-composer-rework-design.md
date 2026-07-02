# Email Composer Rework — Templates, Music Dropdown, Inline Images

**Date:** 2026-07-01
**Status:** Approved

## Goal

Make the announcements composer read like a normal email client without overwhelming
the user: seeded editable templates, music attached from a searchable dropdown
(sent as Drive folder links — already working), and inline image upload.

## Current state

- `src/app/(app)/announcements/composer.tsx` — template dropdown exists but the
  `AnnouncementTemplate` table is always empty (nothing seeds it, no UI creates rows);
  `saveTemplateAction` in `actions.ts` is dead code. Music attach is a checkbox list
  of every Library folder. Recipients are a checkbox stack.
- `src/lib/announce.ts` `buildMusicAttachments` already renders each attached
  Library folder as a shared Drive link (`webViewLink` cached, `shareAnyoneWithLink`
  fallback). No change needed to email-side music behavior.
- `src/lib/sanitize.ts` strips `<img>`; editor has no image button. Images are
  impossible today.
- `/t/[token].gif` tracking-pixel route establishes the pattern of public,
  unauthenticated per-recipient resources served from the app's base URL.

## Design

### 1. Composer becomes email-like (`composer.tsx`)

Reorder into a familiar compose window, top to bottom:

1. **Template** dropdown ("Start from template…") — existing control, now populated.
2. **To:** row — recipient groups as toggleable chips showing `Name (count)`.
   Replaces the checkbox stack. Same `groupIds` form field (hidden checkboxes or
   equivalent), server unchanged.
3. **Subject:** field (unchanged).
4. **Body:** existing `RichText`, plus a new **Image** toolbar button (see §3).
5. **Attach music:** searchable multi-select combobox with chips. Replaces the
   checkbox list. Posts the same `musicIds` form field — `actions.ts` unchanged.
6. Footer buttons: Send now / Schedule / Save draft / **Save as template**.
   "Save as template" prompts for a template name and wires the existing
   `saveTemplateAction` (currently dead code).

### 2. Default templates

- Seed exactly 3 templates when the `AnnouncementTemplate` table is empty,
  checked on load of `/announcements/new` (idempotent ensure function, mirroring
  `ensureBuiltInGroups`): **Rehearsal Reminder**, **Performance Day**,
  **General Update**. Each has a subject and a short bodyHtml skeleton with
  placeholder text (e.g. date/time/location lines).
- Picking a template fills subject + body; the user edits per-send. Edits do not
  write back to the template.
- New templates are created only via "Save as template". No template manager
  page, no delete UI (YAGNI).

### 3. Inline images — hosted-image route

- **Model** `EmailImage`: `id (cuid)`, `mime (string)`, `data (Bytes)`,
  `createdAt`. Prisma migration follows the existing numbered-migration pattern.
- **Upload:** Image toolbar button → file picker → server action validates
  (image/* mime allowlist, ≤ 4 MB) → stores row → returns `/i/<id>` → editor
  inserts `<img src="/i/<id>">` at the cursor.
- **Serving:** public `GET /i/[id]` route handler returns the bytes with the
  stored content-type and long-lived cache headers. Public by design — email
  recipients are unauthenticated, same trust model as the tracking pixel.
- **Send-time rewrite:** in the send path, rewrite `src="/i/...` to
  `src="<appBaseUrl()>/i/..."` so scheduled sends always use the base URL current
  at send time (a locally-composed draft never bakes in `localhost`).
- **Sanitizer:** allow `<img>` and keep a `src` attribute only when it matches
  `^https:` or `^/i/`. All other attributes stripped, consistent with the
  existing allowlist approach.
- **Why not CID attachments:** bytes would be duplicated per recipient (~150×),
  and the send loop grows attachment logic. One hosted copy is simpler; Gmail
  proxies remote images so they display by default.

### 4. Music in the sent email

No behavioral change. Only cosmetic: label the links block (e.g. "🎵 Music")
in the email wrapper in `src/lib/email.ts` so the folder links read as a
distinct section.

## Error handling

- Image upload: reject non-image mime or > 4 MB with a field error shown next to
  the editor; body content is preserved.
- `GET /i/[id]` unknown id → 404.
- Template seeding failure must not block the compose page (best-effort, same as
  `ensureBuiltInGroups`).
- Existing announcement send/error paths untouched.

## Testing

- Sanitizer unit coverage: `<img src="/i/abc">` kept, `<img src="http://…">`
  (non-https) stripped to no-src/dropped, `onerror` etc. stripped.
- Send-time rewrite: relative `/i/` src becomes absolute with `appBaseUrl()`.
- Manual E2E: seed templates appear; pick template → fields fill; attach music
  via combobox → email contains Drive folder link; upload image → renders in
  editor, in `/i/<id>`, and in received email.

## Out of scope (YAGNI)

- Template manager page / template delete or edit-in-place
- Orphaned `EmailImage` cleanup job
- Drive-hosted image embedding
- Individual PDF links per piece (folder link chosen)
