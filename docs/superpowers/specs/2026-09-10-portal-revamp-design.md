# Drum Major Portal — Revamp Plan (Sep 2026)

Repo: `/Users/neelbansal/drummajor-portal` (Next.js 16 App Router, React 19, Prisma 7, Tailwind 4, shadcn on `@base-ui/react`, PGlite dev DB, Google Drive via `googleapis`). Branch for this work: `feat/revamp-sep-2026` off `main`. One commit per phase, verification per phase.

## Context

Portal is MVP-complete and in real use, but the user walked the app and found: the theme should change to school colors; dashboard "Open tasks" hides unassigned tasks; the email composer's message field is a fragile hand-rolled `contentEditable` and the announcements page is one flat list with no draft editing; the sidebar is a flat list and Handoff clutters it; drum majors never receive the announcements they send; nobody is emailed when tasks/ideas are created; events can't target just the drum majors; the Library is a generic Drive mirror with no piece/part metadata, no index, and its root folder is an app-created "Band Library" instead of the real `Band Music Database` folder. The user is graduating next year, so the app also needs a quick-start guide and a clean yearly rollover: import rosters from saved Google Classroom "People" pages, clear last year's roster.

## Decisions (locked with user)

- **Colors**: Winchester school colors — red + black/charcoal on warm neutrals. Light mode default, dark mode via toggle.
- **Drive index**: `index.csv` at the root of `Band Music Database`; app regenerates and re-uploads it.
- **Auto-cc**: every portal user with role `DRUM_MAJOR` or `ADMIN` is added to every announcement send, deduped by email.
- **Recipient groups**: built-ins become `Everyone`, `Jazz Band`, `Concert/Marching Band` (Marching + Concert merged).
- **Sidebar**: Dashboard · **Band** (Email Announcements, Band Events) · **Leadership** (Drum Major Events, Tasks, Ideas) · **Music** (Library). Handoff and Quick start move to the user menu (Quick start also gets a sidebar footer link).
- **Editor**: replace `execCommand` editor with Tiptap; `@` mentions a piece of music and auto-attaches it. Exact mention/attachment criteria are deferred to a later conversation; this round ships the mechanism + a visible hint.
- **Roster import**: parse a saved Classroom People page server-side; students only (`Classmates`/`Students` section + `wpsstudent.com` domain); only the **visible** view in the saved HTML counts.
- **Assumptions made without asking**: DM events get an `.ics` attachment; sent-history stays on the announcements page as a third section; `(invited)` Classroom rows are imported like everyone else (the marker is present on every row and hidden by CSS, so it can't be trusted).

---

## Phase 1 — Shell, theme, nav, quick wins

**Theme** — rewrite tokens in `src/app/globals.css` (keep the `@theme inline` map and utility class names so pages don't churn):
- Light (`:root`): background `oklch(0.985 0.004 75)`, foreground `oklch(0.20 0.01 40)`, card/popover white, primary `oklch(0.53 0.21 27)` (crimson) / primary-foreground `oklch(0.99 0 0)`, secondary/muted/accent `oklch(0.95 0.006 75)`, muted-foreground `oklch(0.48 0.015 50)`, border/input `oklch(0.90 0.008 75)`, ring = primary, destructive `oklch(0.45 0.19 25)`, success `oklch(0.52 0.12 150)`, `--radius: 0.5rem`. Sidebar is the "black": `--sidebar oklch(0.17 0.008 260)`, sidebar-foreground `oklch(0.93 0.005 75)`, sidebar-accent `oklch(0.24 0.01 260)`, sidebar-primary `oklch(0.62 0.21 27)`, sidebar-border `oklch(0.26 0.01 260)`.
- Dark (`.dark`): background `oklch(0.16 0.006 260)`, card `oklch(0.21 0.007 260)`, foreground `oklch(0.95 0.004 75)`, primary `oklch(0.64 0.21 26)` / primary-foreground `oklch(0.12 0 0)`, muted `oklch(0.26 0.008 260)`, muted-foreground `oklch(0.70 0.01 75)`, border `oklch(0.30 0.008 260)`, sidebar `oklch(0.12 0.005 260)`.
- `.field-grid`, `.eyebrow`, `.stat-numeral` keep names; retune `--grid-line(-strong)` to red at low alpha. Keep Geist + Saira Condensed fonts.
- Because primary and destructive are both red, every destructive action gets an `AlertDialog` confirm (added in later phases as those screens are touched).

**Theme toggle + toasts** — `src/app/layout.tsx`: drop the literal `dark` class, add `suppressHydrationWarning`, wrap in `ThemeProvider` (`next-themes`, `attribute="class"`, `defaultTheme="light"`, `enableSystem`), mount `<Toaster />` from `src/components/ui/sonner.tsx`. New `src/components/theme-toggle.tsx` (Light / Dark / System) rendered inside the user menu.

**shadcn additions** — `npx shadcn@latest add alert-dialog checkbox separator tooltip popover` (base-nova style, matches `components.json`).

**Sidebar** — `src/components/app-sidebar.tsx`: replace flat `items[]` with sections:
```
{ items: [Dashboard /dashboard] }
{ label: "Band",       items: [Email Announcements /announcements (Megaphone), Band Events /events (CalendarDays)] }
{ label: "Leadership", items: [Drum Major Events /dm-events (CalendarCheck), Tasks /tasks, Ideas /notes] }
{ label: "Music",      items: [Library /library (FolderOpen)] }
```
Section labels use `.eyebrow`. Footer link "Quick start" → `/guide` (BookOpen). Remove Handoff. Gating unchanged (`canInvite` for Band/Leadership, `canMusic` for Library). Active-state logic unchanged (`/events` vs `/dm-events` don't prefix-collide).

**User menu** — `src/components/user-menu.tsx`: add Handoff (`/handoff`, Flag), Quick start (`/guide`, BookOpen), theme toggle group; keep Roster / Invites / Members / Logs / Settings / Sign out.

**Roles helpers** — `src/lib/roles.ts`: add `LEADERSHIP_ROLES = [ADMIN, DRUM_MAJOR]`, `isAdmin(role)`, `isLeadership(role)`, `canManageMusic(role)`. Use in `(app)/layout.tsx` and all new code (no mass refactor of existing inline checks).

**Dashboard fix** — `src/app/(app)/dashboard/page.tsx`: both task queries become `where: { status: { not: COMPLETED }, OR: [{ assigneeId: user.id }, { assigneeId: null }] }`, `orderBy: { createdAt: "desc" }`; card renamed "Open tasks", rows show `Unassigned` / assignee name badge, card links to `/tasks`. Hero gets a "Quick start" button. Card grid becomes 3 columns on `lg` (six cards after Phase 4 adds Drum major events).

**Quick start guide** — new `src/app/(app)/guide/page.tsx` (static server component, any authed role, anchored sections, printable):
1. Yearly handoff checklist (order of operations).
2. Rosters from Google Classroom: open the class → People → `Ctrl/Cmd+S` → "Webpage, Complete" → upload the `.html` on Roster → pick Jazz Band or Concert/Marching Band → preview → import. Notes: teachers are skipped automatically; students in both classes end up in both groups; you won't see yourself in your own Classmates list (drum majors get every email anyway); if the page shows the wrong class name in the preview, re-save after a full reload.
3. Clearing last year's roster.
4. Adding / removing drum majors (Invites, Members, transfer admin, sign-out-other-devices).
5. Sending an announcement, templates, `@` mentions.
6. Adding music (part naming rules) and where `index.csv` lives.
7. Handoff notes.

**Proxy** — `proxy.ts` matcher: add `/library`, `/dm-events`, `/guide`; remove `/music`, `/vault`.

**Step 0 of this phase**: copy this plan into the repo as `docs/superpowers/specs/2026-09-10-portal-revamp-design.md` and append a status entry to `docs/plan.md`.

---

## Phase 2 — Rosters: group merge, Classroom import, clear roster, DM dedupe

**Group merge** — migration `prisma/migrations/3_groups_merge/migration.sql`: rename `Jazz` → `Jazz Band`; create `Concert/Marching Band` (`builtIn = true`); copy `ContactGroup` rows from `Marching` and `Concert` into it (`ON CONFLICT DO NOTHING`); delete `Marching`/`Concert`. Guard every statement with `WHERE EXISTS` so re-runs are safe. Update `src/lib/groups.ts`: `BUILTIN_GROUPS = [EVERYONE, JAZZ_GROUP = "Jazz Band", CONCERT_MARCHING_GROUP = "Concert/Marching Band"]`. Fix CSV import placeholder copy in `rosters/csv-import.tsx`.

**Leadership helper** — new `src/lib/leadership.ts`: `getLeadershipUsers()` (`User where role in LEADERSHIP_ROLES`), `getLeadershipEmails()` (lowercased), `emailLeadership({ subject, html, exceptUserId?, attachments? })` (sequential `sendMail`, per-recipient try/catch, never throws). Used by Phases 3–4.

**Student domain** — `src/lib/allowlist.ts`: add `STUDENT_DOMAINS = ["wpsstudent.com"]` + `isStudentEmail()`. (`ALLOWED_DOMAINS` stays for portal sign-ups.)

**Classroom parser** — new `src/lib/classroom-roster.ts` using `node-html-parser` (new dep), pure and unit-tested:
- `parseClassroomPeople(html) → { className, expectedCount, students: {name,email}[], skipped: {email,name,reason}[], warnings: string[] }`.
- Roots = every `c-wiz` containing an `h2` whose text is `Classmates` or `Students`. Visible = `style` lacks `display: none` and `visibility: hidden`, and `aria-hidden !== "true"`. Take the last visible root; if none visible take the last root and warn. (Verified on the user's saves: the Jazz file holds a hidden earlier view with 44 students and the visible Jazz view with 30; the Concert file has one visible view with 100.)
- Students = `[role="listitem"]` inside the root that contain `a[aria-label^="Email "]`. Email = label after `Email `, trimmed + lowercased. Name = text of `span[id^="rtsc-"]`, else first text node, with `(invited)` stripped; fallback = email local part.
- `className` from `<title>` (`People in <name> - Classroom`); `expectedCount` from the `N students` text. Warn when `students.length` is neither `expectedCount` nor `expectedCount - 1` (the saver is excluded from their own Classmates list).
- Skip with reason: non-student domain (teachers, `group.calendar.google.com`), duplicate within file, invalid email. Emails in class-description text are never picked up because parsing is listitem-scoped.
- Tests `tests/classroom-roster.test.ts`: synthetic fixtures for hidden + visible views, teacher `<ul>`, description-text emails, `(invited)` span, staff domain, `Students` heading (teacher view), no-c-wiz fallback. Plus a manual check against the two real files in `~/Downloads`.

**Import actions** — `rosters/actions.ts`: `previewClassroomImportAction(formData)` and `commitClassroomImportAction(formData)` (both re-parse the uploaded file; `FormData` fields: `file`, `groupId`, `syncGroup` checkbox). Raise `experimental.serverActions.bodySizeLimit` to `10mb` in `next.config.ts` (saves are ~2.2–2.4 MB). Classification per student: `new` (create contact + membership), `in-group` (no-op), `add-to-group` (existing contact from the other class), `drum-major` (email matches a leadership user — still imported, badge shown). When `syncGroup` is on: contacts currently in the group but absent from the file → `remove-from-group`; if that leaves them with zero groups → `delete`. Commit runs in one transaction, audits `ROSTER_IMPORTED { source: "classroom", group, className, added, addedToGroup, removed, deleted, skipped }`.

**Clear roster** — `clearRosterAction()` deletes all `Contact` rows (cascade `ContactGroup`; `EmailDelivery` stores email strings, so history survives). `clearGroupAction(groupId)` removes all memberships of one group. Both behind `AlertDialog` with type-to-confirm ("CLEAR"), audited `ROSTER_CLEARED` / `GROUP_CLEARED`.

**Roster UI** — `rosters/page.tsx` + new `rosters/classroom-import.tsx`: new first card "Import from Google Classroom" with the step list, file input, group select, sync checkbox, Preview table (status badges + reasons, detected class name + count line), Import button, toast on result. Contacts table gets a `Drum major` badge (email ∈ `getLeadershipEmails()`). Groups card gets "Remove all members" per group and a "Clear entire roster" button. CSV import card collapses to a `<details>` "Other ways to import".

---

## Phase 3 — Announcements

**Recipients** — `src/lib/announce.ts` `resolveRecipients()`: union `getLeadershipEmails()` into the email set (dedupe by lowercase email already covers DMs who appear on rosters). Escape item names in `buildMusicAttachments` (`:105`). Keep the ≥1 group requirement in the composer.

**List page** — `announcements/page.tsx`: header with **New announcement** (primary → `/announcements/new`) and **From template** (secondary → `/announcements/templates`). Then sections **Drafts** (DRAFT; row actions Edit / Delete), **Scheduled** (SCHEDULED + PENDING_APPROVAL; actions View / Cancel), **Sent** (SENT / SENDING / FAILED with opened counts). Single query, group in memory by status.

**Templates page** — new `announcements/templates/page.tsx` (cards: name, subject, body snippet; buttons Use → `/announcements/new?template=<id>`, Edit → `/announcements/templates/[id]/page.tsx`, Delete via AlertDialog) and `announcements/templates/[id]/template-form.tsx`. New actions `updateTemplateAction`, `deleteTemplateAction` in `announcements/actions.ts` (reuse `templateSchema`).

**Draft edit + cancel** — new `announcements/[id]/edit/page.tsx` (DRAFT only, else redirect to detail) rendering `Composer` with `initial={{ id, subject, bodyHtml, groupIds, musicIds, scheduledAt }}`; composer posts hidden `announcementId` so `upsertDraft` (`actions.ts:19-68`) updates instead of creating. `[id]/page.tsx` gets an "Edit draft" button. New `cancelScheduledAction(id)`: SCHEDULED/PENDING_APPROVAL → delete unsent `EmailDelivery` rows, status DRAFT, `scheduledAt` null, audit `ANNOUNCEMENT_CANCELLED`. `deleteAnnouncementAction` gets a server-side DRAFT guard.

**Composer** — `announcements/composer.tsx` + `new/page.tsx` (reads `searchParams.template` to preselect):
- Keep "Start from a template" select; To chips (now three built-ins + custom) with hint "Drum majors and admins always receive a copy."
- Subject; **Message** = new Tiptap editor; Attach music picker; Schedule; Send now / Schedule / Save draft / Save as template.
- Hint under the editor: "Type `@` to mention a piece from the Library — it's attached automatically."

**Editor** — rewrite `src/components/rich-text.tsx` on Tiptap (deps: `@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-mention @tiptap/suggestion @tiptap/extensions`). Props: `name`, `initialHtml`, `onChange(html)`, `onImageUpload?`, `mentionItems?: MusicOption[]`, `onMentionsChange?(ids)`. Toolbar: Bold, Italic, Underline, Bullet, Numbered, Link, Image (reuses `uploadImageAction`). Placeholder from `@tiptap/extensions`. Mention: trigger `@`, popup filters `mentionItems` by title/subtitle, renders `@Title` chip; `onUpdate` walks `editor.getJSON()` to collect mention ids. Hidden input posts `bodyHtml` where mention nodes are serialized as `<strong>Title</strong>` (sanitizer allowlist unchanged); mentioned ids are posted as `musicIds` too. `MusicPicker` gets a `locked` prop so mention-derived chips show "mentioned" and aren't removable. Template apply still remounts via `key`. `handoff/handoff-form.tsx` uses the same component (no mentions).

**Email design** — `src/lib/email.ts` `layout()`: red header bar with the band name from `Organization`, charcoal text, same structure for announcement + transactional mails. Add `taskCreatedEmail`, `ideaCreatedEmail`, `dmEventEmail` builders (used in Phase 4). Extend `sendMail` opts with optional `attachments` / `icalEvent`.

**Music option shape** — `MusicOption = { id: libraryItemId, title, subtitle?: string }` now; Phase 5 swaps the source from "every folder" to `MusicPiece`.

---

## Phase 4 — Events (band vs drum major), task + idea emails

**Schema** — migration `4_events_audience`: `enum EventAudience { BAND DRUM_MAJORS }`, `Event.audience EventAudience @default(BAND)`, `Event.location String?`, `Event.createdById String?`.

**Routes** — `/events` = band events (filter `audience: BAND`); new `/dm-events` = drum major events (`DRUM_MAJORS`). Extract shared `events/event-form.tsx` (adds `audience` hidden field, `location` field; checkbox label differs) and `events/event-list.tsx` (Upcoming / Past split, past collapsed). `dm-events/page.tsx` reuses both.

**Actions** — `events/actions.ts` `createEventAction`: BAND + notify → existing `announceEvent()` but escape title/description (`escapeHtml` helper in `src/lib/sanitize.ts`) and pass `exceptUserId` to `notifyAll`. DRUM_MAJORS → always `emailLeadership()` with `dmEventEmail` + `.ics` (`icalEvent: { method: "REQUEST", content }`) and `notifyUsers(leadershipIds except creator, "DM_EVENT", { title, when })`. New pure `src/lib/ics.ts` `buildIcs({ uid, title, description, location, start, end?, allDay })` using floating local time (no dependency), unit-tested.

**Tasks** — `tasks/actions.ts` `createTaskAction`: after create, `notifyUsers(leadership except actor, "TASK_CREATED", { title, assignee })` and fire-and-forget `emailLeadership(taskCreatedEmail(...))`. Existing `TASK_ASSIGNED` to the assignee stays.

**Ideas** — `notes/actions.ts` `createNoteAction`: `notifyUsers(leadership except actor, "NOTE_CREATED", { preview })` + `emailLeadership(ideaCreatedEmail(...))`; omit author name when `anonymous`.

**Notifications** — `notifications/page.tsx` summarizer: add `TASK_CREATED`, `NOTE_CREATED`, `DM_EVENT`, `MUSIC_ADDED` (emitted in Phase 5). Dashboard: "Upcoming events" shows an audience badge; add a sixth card "Drum major events".

---

## Phase 5 — Library / Drive music catalog

**Drive settings (admin)** — `(app)/settings/page.tsx` gains an admin-only "Google Drive" card: current root (id + folder name via Drive), input "Root folder ID or URL" (`parseDriveFolderId()` accepts `…/folders/<id>` or bare id), **Test access** (lists top-level children), **Save**, **Sync now**, re-upload service-account JSON. Actions in `settings/actions.ts`: `saveDriveRootAction`, `testDriveAction`, `syncDriveNowAction`, `updateDriveCredentialsAction`. `ensureRootFolder()` in `src/lib/drive.ts` keeps returning `driveRootFolderId` when set (it only auto-creates "Band Library" when unset).

**Schema** — migration `5_music_catalog`:
```prisma
enum MusicCategory { CONCERT_BAND JAZZ_BAND MARCHING_BAND MISCELLANEOUS MUSICAL ORCHESTRA SOLO_ENSEMBLE }
enum CreditType    { ARRANGER COMPOSER }
model MusicPiece {
  id         String        @id @default(cuid())
  folderId   String        @unique
  folder     LibraryItem   @relation(fields: [folderId], references: [id], onDelete: Cascade)
  title      String
  credit     String?
  creditType CreditType?
  category   MusicCategory
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  @@index([category]) @@index([title])
}
```
plus `LibraryItem.piece MusicPiece?`, `LibraryItem.syncAttempts Int @default(0)`, `AppSettings.driveIndexFileId String?`.

**Naming module** — new pure `src/lib/music-naming.ts` (unit-tested):
- `CATEGORY_FOLDERS: Record<MusicCategory, string>` = Concert Band / Jazz Band / Marching Band / Miscellaneous / Musical / Orchestra / Solo-Ensemble; `categoryFromFolderName(name)` matches case-insensitively after stripping non-alphanumerics (so `Solo/Ensemble`, `Solo-Ensemble`, `Solo Ensemble` all match).
- `parsePieceFolderName("Title - arr. Name")` → `{ title, credit, creditType }` (`/^(.+?)\s+-\s+(arr\.?\s+)?(.+)$/i`; no dash → credit null); `pieceFolderName({title, credit, creditType})` inverse.
- `PART_ORDER[category]`: concert-order lists (CONCERT: Score, Piccolo, Flute 1/2, Oboe, Bassoon, Clarinet 1/2/3, Bass Clarinet, Alto Sax 1/2, Tenor Sax, Bari Sax, Trumpet 1/2/3, Horn 1/2, Trombone 1/2/3, Baritone/Euphonium, Tuba, String Bass, Piano, Mallets, Timpani, Percussion 1/2/3, Drum Set; JAZZ: Score, Alto 1/2, Tenor 1/2, Bari, Trumpet 1–4, Trombone 1–4, Piano, Guitar, Bass, Drums, Aux Percussion; ORCHESTRA: winds + Violin 1/2, Viola, Cello, Bass; MARCHING/MISC/MUSICAL/SOLO_ENSEMBLE reuse CONCERT + strings). One constant, easy to edit.
- `partFileName({ title, parts })` → `Title - Flute 1.pdf` | `Title - Flute 1 to Clarinet 2.pdf` (first → last in concert order) | `Title - Score.pdf`; `parsePartFileName()` inverse; `sortPartFiles(files, category)`.
- `suggestParts(originalFilename, category)`: alias map (`fl`, `cl1`, `tpt 2`, `asax`, …) to pre-select parts in the Add-music form.

**Drive client** — `src/lib/drive.ts` add: `renameDriveItem(id, name)`, `moveDriveItem(id, fromParentId, toParentId)` (`files.update` add/removeParents), `getDriveItem(id)` (name, mimeType, parents), `findChildByName(parentId, name)`, `updateFileContent(id, mimeType, buffer)` (`files.update` media). Delete the dead exports (`getFileBuffer`, `getFileStream`, `shareWithUser`, `getWebViewLink`, `ensureVaultFolder`).

**Tree sync** — `src/lib/library-sync.ts` add `syncDriveTree()`:
1. Root = `driveRootFolderId` (throw a clear error if unset).
2. BFS from root (depth cap 6): upsert `LibraryItem` by `driveId` (name, type, mimeType, size, webViewLink, parent, `SYNCED`). `index.csv` at root is recorded in `AppSettings.driveIndexFileId` and excluded from the tree.
3. Root children whose name maps to a `MusicCategory` are category folders; each folder directly under them gets a `MusicPiece` upsert (parse name; renames re-parse).
4. After the walk, delete `SYNCED` rows under root whose `driveId` was not seen (`PENDING` rows untouched).
5. Then `rebuildIndexCsv()`.
`refreshFolderFromDrive` is replaced by this; the Refresh button syncs everything. Schedule `*/15 * * * *` in `src/lib/scheduler.ts` alongside the existing minute job. `processPendingItems` gains backoff (`syncAttempts` ≤ 5, reset by a manual Retry) and calls `rebuildIndexCsv()` when it pushed anything.

**Index** — new `src/lib/music-index.ts` `rebuildIndexCsv()`: rows `Category,Title,Credit Type,Composer/Arranger,Parts,Files,Drive Link,Updated` (pieces + parsed part files, sorted by category then title; RFC-4180 escaping). Upload via `updateFileContent(driveIndexFileId)`; if unset, `findChildByName(root, "index.csv")` else `uploadFile` and store the id. Module-level in-flight/dirty flags coalesce bursts.

**Library UI**:
- `library/page.tsx` (root): "Music catalog" header with search (`?q`, title/credit, server-side `contains` insensitive), category chips (`?category`), **Add music** → `/library/new`. Results table: Title, Composer/Arranger, Category, Parts, Updated → `/library/[folderId]`. Below: existing folder browser for non-music folders. Toolbar keeps New folder / Upload / Sync.
- `library/[id]/page.tsx`: if the folder has a `piece` → new `library/piece-view.tsx`: header (title, credit, category badge, Open in Drive), **Edit details** dialog → `updatePieceAction` (rename folder in Drive then DB; move to the new category folder on category change; rename every part file whose parsed title matches the old title), parts table in concert order (name, part range, size, Open), **Add parts** (upload PDFs + part select, same generator), per-file **Edit parts** (re-select → rename DB + Drive), Delete file / Delete piece (AlertDialog → `deleteDriveItem` on the folder + DB cascade). Otherwise the generic browser as today.
- `library/new/page.tsx` + `library/new/add-music-form.tsx` (client): Category select, Title, credit type toggle (Arranger / Composer) + name, multi-PDF input. Per file: original name, part multi-select chips from `PART_ORDER[category]` (pre-filled by `suggestParts`), live generated filename. Submit → `createPieceAction`: validate (`musicPieceSchema` in `validation.ts`); ensure the category folder `LibraryItem` exists (find by name under root, else create `PENDING`); create piece FOLDER (`PENDING`) + `MusicPiece`; `stageUpload` each PDF under its generated name (`PENDING`); `kickSync()`; audit `MUSIC_PIECE_CREATED`; `notifyAll("MUSIC_ADDED", { title }, actor.id)`; redirect to the piece page (rows show Uploading… until pushed).
- `renameItemAction` now renames in Drive first (`renameDriveItem`) then DB; failures surface via `ActionState.error` + toast. All library actions return `ActionState` instead of `void` so the UI can toast.

**Announcements integration** — `new/page.tsx` + `[id]/edit/page.tsx` load `MusicOption`s from `MusicPiece` (`id = folderId`, `title`, `subtitle = "arr. Name · Jazz Band"`). Email "🎵 Music" section lists `Title — arr. Name` with the folder link.

**Unchanged on purpose**: `shareAnyoneWithLink` on every pushed item (recipients outside the school domain need the link to work). Flagged as a follow-up question, not changed here.

---

## Verification

Per phase, before committing:
- `npx tsc --noEmit`, `npm run lint`, `npm test` (new tests: `classroom-roster`, `music-naming`, `ics`, `music-index` CSV escaping; existing `sanitize`).
- `npm run dev` (PGlite; `scripts/dev-db.mjs` applies the new migrations) and click through:
  - P1: light/dark toggle persists; sidebar sections + footer link; Handoff/Quick start in user menu; `/guide` renders; dashboard shows unassigned tasks; toasts appear.
  - P2: `/rosters` shows merged groups; upload `~/Downloads/People in '26-'27 Jazz Band _ Marching Band - Classroom.html` → preview says class `'26-'27 Jazz Band / Marching Band`, 29 students, warning about a hidden earlier view; Concert file → 99 students; import both; 21-ish overlap shows as `add-to-group`; re-import with sync on is a no-op; Clear roster requires typing CLEAR and leaves announcement history intact.
  - P3: Drafts/Scheduled/Sent sections; create → edit → schedule → cancel → edit again; template Use/Edit/Delete; typing in the editor works (bold/list/link/image); `@` mention adds a locked chip; send to a test group and confirm DM/admin emails are in `EmailDelivery` exactly once even when they're also on the roster.
  - P4: Band event with notify → announcement to Everyone; DM event → email with `.ics` to leadership only + bell; task/idea creation → email + bell for the other leaders, not the creator.
  - P5 (needs live Drive creds on the server): set root to `Band Music Database`, Test access lists the category folders, Sync now populates pieces with parsed title/credit; `index.csv` appears/updates; Add music creates `Concert Band/<Title - arr. Name>/<Title - Flute 1 to Clarinet 2.pdf>`; Edit details renames folder + files in Drive; delete removes from Drive; announcement mention picks the piece and the email links the folder.
- `npm run build` clean at the end of each phase.

---

## Appendix — Findings from exploration

### Announcements
- List page `src/app/(app)/announcements/page.tsx` — flat list, no where clause, no tabs; subtitle promises sections that don't exist.
- No draft-edit route; `[id]/page.tsx` is read-only. `upsertDraft` (`announcements/actions.ts:19-68`) already supports update-by-`announcementId` while DRAFT, but the composer never posts that field.
- Composer `announcements/composer.tsx`: template `<select>`, To chips = checkboxes `groupIds`, controlled subject, `RichText` keyed by `bodyKey`, `MusicPicker` (hidden `musicIds`), `scheduledAt`, `intent=send|schedule|draft`, `SaveTemplateDialog`.
- Editor `src/components/rich-text.tsx`: `contentEditable` + `document.execCommand`, `dangerouslySetInnerHTML` seed, hidden input synced on `onInput`. Deprecated API, fragile selection; template apply remounts and discards typed text; reselecting the same template does nothing.
- Groups `src/lib/groups.ts`: `BUILTIN_GROUPS = ["Everyone","Marching","Concert","Jazz"]`; Everyone is virtual.
- Drum majors not auto-included: `resolveRecipients` (`src/lib/announce.ts:19-34`) resolves Contacts only; `User` and `Contact` are unrelated.
- Templates: `AnnouncementTemplate {name, subject, bodyHtml}`, seeded by `src/lib/announcement-templates.ts` when empty; create-only (`saveTemplateAction`), no edit/delete UI.
- Status enum `DRAFT|SCHEDULED|PENDING_APPROVAL|SENDING|SENT|FAILED`; `enqueueAnnouncement` (`announce.ts:40-72`) materializes `EmailDelivery`; `processQueue` every minute (`src/lib/scheduler.ts`, boot in `src/instrumentation.ts`).
- Music attach: options are every Library FOLDER; `buildMusicAttachments` (`announce.ts:92-112`) emits Drive links under "🎵 Music" in `src/lib/email.ts:41-57`; `files[]` always empty; name interpolated unescaped.
- Actions: `composeAction`, `approveAction`, `deleteAnnouncementAction` (no status guard), `saveTemplateAction`, `uploadImageAction` (4 MB → `EmailImage`, served at `/i/[id]`).

### App shell / theme / dashboard / tasks
- Theme `src/app/globals.css`: light `:root` (`:55-92`), dark `.dark` (`:95-131`), brass primary + midnight bg; `--radius 0.4rem`; utilities `.field-grid`, `.stat-numeral`, `.eyebrow`. Fonts Geist / Geist Mono / Saira Condensed via `next/font`.
- `dark` hardcoded on `<html>` (`src/app/layout.tsx:39`); `next-themes` installed, no `ThemeProvider`; `<Toaster/>` never mounted.
- Sidebar `src/components/app-sidebar.tsx` flat `items[]` (`:33-41`), gating via `canInvite`/`canMusic` from `(app)/layout.tsx:17-18`; hand-rolled mobile drawer.
- User menu `src/components/user-menu.tsx`: Roster, Invites, Members, Logs, Settings, Sign out (Base UI `render={<Link/>}`).
- Dashboard `(app)/dashboard/page.tsx`: hero stats + 5 cards; task list (`:26-30`) and count (`:38-40`) filter `assigneeId: user.id` → NULL excluded; task form defaults to Unassigned (`tasks/task-form.tsx:19-23`, `tasks/actions.ts:19`).
- Tasks: `Task {title, status, assigneeId?}`; `/tasks` shows all; `createTaskAction` in-app `TASK_ASSIGNED` only; no email.
- Notes: `createNoteAction` sends nothing; vote/comment notify author.
- Notifications: `src/lib/notify.ts` `createNotification`, `notifyUsers`, `notifyAll(type, payload, exceptUserId?)`, `unreadCount`, `markAllRead`; summarizer in `notifications/page.tsx:10-28`.
- Events: `Event {title, description?, date, time?, notify}`; `announceEvent` (`events/actions.ts:19-39`) hardcodes EVERYONE, unsanitized title/description, `notifyAll` without `exceptUserId`.
- Handoff: `HandoffNote {year, category, title, bodyHtml, authorId?}`; form uses `RichText`.
- Roles: `ADMIN|DRUM_MAJOR|LIBRARIAN`; `src/lib/roles.ts` only labels + `assignableRoles`; `requireRole` in `src/lib/auth.ts:46-49`. Portal users = leadership only; students are `Contact` rows.
- Email `src/lib/email.ts`: `appBaseUrl`, `getSmtpConfig`, `buildTransport`, `fromHeader`, `announcementEmail`, `sendMail({to,subject,html})`, `sendTestEmail`, `inviteEmail`, `verificationEmail`, `passwordResetEmail`; private `layout()`/`button()`; neutral palette.
- shadcn present: badge, button, card, dialog, dropdown-menu, input, label, select, sonner, table, tabs, textarea. Raw `<select>`/checkboxes used throughout.
- `src/lib/validation.ts` schemas (`contactSchema:98`, `templateSchema:131`, `eventSchema:137`, `taskSchema:144`, `handoffNoteSchema:162`), `src/lib/form.ts` (`ActionState`, `emptyState`), `src/lib/audit.ts` `logAudit`.
- Roster: `rosters/actions.ts` (contact/group CRUD, two-phase CSV import `previewImportAction`/`commitImportAction` with `classify()`), `rosters/csv-import.tsx`, `rosters/roster-manager.tsx`, `src/lib/csv.ts` parser; `src/lib/allowlist.ts` `ALLOWED_DOMAINS = ["wpsstudent.com","winchesterps.org"]`.

### Library / Drive
- Model: single tree `LibraryItem {name, type FOLDER|FILE, parentId, driveId, webViewLink, mimeType, sizeBytes, note, syncState PENDING|SYNCED|ERROR, syncError, stagedPath, uploadedById}`; no piece/part/category fields (old `MusicPiece`/`MusicFile` dropped in migration `2_library_merge`).
- Drive client `src/lib/drive.ts`: SA JWT (scope `drive`, optional `impersonate`), `supportsAllDrives`. Live: `isDriveConfigured`, `createFolder`, `ensureRootFolder` (auto-creates "Band Library" when `driveRootFolderId` unset), `uploadFile`, `shareAnyoneWithLink`, `deleteDriveItem`, `listFolderChildren`. Dead: `getFileBuffer`, `getFileStream`, `shareWithUser`, `getWebViewLink`, `ensureVaultFolder`. No `files.update`.
- Root folder never user-settable; wizard step 4 (`src/app/setup/wizard.tsx:115-143`, `setup/actions.ts:95-124`) only stores SA JSON; `(app)/settings` is profile-only.
- Sync `src/lib/library-sync.ts`: push-dominant write-back (`stageUpload` → `.staging/` → PENDING → `kickSync`/cron → `pushItem` → `shareAnyoneWithLink`); every tick resets ERROR→PENDING; pull `refreshFolderFromDrive` is one level, additive, manual.
- UI: `library-browser.tsx` (breadcrumbs via `getBreadcrumbs`, rows via `listChildren` in `src/lib/library.ts`), `library-toolbar.tsx` (New folder / Upload / Refresh), `item-actions.tsx` (Open / Rename / Delete); `[id]/page.tsx` redirects FILE → `/[id]/open` (302 to `webViewLink`). Actions in `library/actions.ts` return `void`; `renameItemAction` is DB-only.
- Announcement attach options = every FOLDER; `AnnouncementMusic` join.
- `proxy.ts` matcher lists `/music`, `/vault`, not `/library`.
- Accurate current design doc: `docs/superpowers/specs/2026-06-26-library-merge-and-ui-design.md`; `docs/plan.md` is stale on library.

### Classroom "People" page saves (from `~/Downloads`)
- Saved as "Webpage, Complete"; ~2.2–2.4 MB `.html` + `_files/` folder (only the `.html` matters).
- Sections: `<h2>Teachers</h2>` (`<ul><li>` rows, `winchesterps.org`) and `<h2>Classmates</h2>` (student view; teacher view says `Students`) followed by `N students` and `div[role="listitem"][data-current-student-id]` rows; each row has `span[id^="rtsc-"]` name, an always-present hidden `(invited)` span, and `<a aria-label="Email <email>" href="https://mail.google.com/mail/?view=cm…">`.
- The SPA keeps previously visited views in the DOM inside `<c-wiz data-view-id>` wrappers styled `display: none; visibility: hidden` + `aria-hidden="true"`; only one is `visibility: visible`. Jazz save: hidden view 44 students (an earlier class), visible view 30 students (29 listitems + the saver). Concert save: one visible view, 100 students (99 listitems).
- Two extra `wpsstudent.com` emails live in the class description text ("contact X or Y"), not in listitems.
- Jazz ∩ Concert overlap is ~21 students; union ~148.
