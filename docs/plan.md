# Drum Major Portal — Build Plan

## Context

Winchester drum majors (~5 leaders, supporting ~150 students) currently struggle with
fragmented communication, disorganized sheet music, and no institutional memory between
graduating classes. This project builds a single secure, invite-only web portal — a "band
leadership operating system" — covering **communication** (announcements via the band's
Gmail), **music management** (Google Drive-backed library), **planning** (events, tasks,
sticky-note idea board), and **knowledge retention** (audit log, document vault, handoff
notes).

Decisions locked in with the user:
- **Hosting:** self-hosted on a music-department server, run as a **native systemd service-- No docker
  (NOT dockerized)**. Postgres installed natively on the same box.
- **Phasing:** ship an MVP first (Stages 1–5), then iterate (Stages 6–9).
- **Domain:** user already owns one; we point it at the server.
- **Secrets:** Gmail app password + Drive service-account JSON entered in the setup wizard,
  **encrypted at rest** in the DB with an app-level key.
- **Access:** invite-only; signup restricted to `@wpsstudent.com` and `@winchesterps.org`.
- **Roles:** Admin (top tier, incl. directors), Drum Major, Librarian (see Security Model).

> Note: per the user's request, an in-repo `docs/plan.md` mirror of this plan will be created
> as the first implementation step and kept updated as stages complete. (Plan-mode currently
> restricts edits to this file only.)

---

## Tech Stack & Infrastructure

| Concern | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One process serves UI + API routes; runs under `next start` via systemd. |
| UI | **Tailwind + shadcn/ui** | Fast, consistent, good defaults; matches the look the user described. |
| DB | **PostgreSQL (native install)** + **Prisma ORM** | Single relational store for users, rosters, announcements, music metadata, notes, audit. |
| Auth | **Hand-rolled sessions** (HttpOnly cookie + `Session` table; bcrypt creds) | Schema was built for custom sessions (`sessionToken`/`userAgent`/`ipAddress`/`lastActiveAt`, no Auth.js adapter models). Auth.js Credentials can't do real DB sessions, which "log out other devices", active-session list, and impersonation all need. See `src/lib/session.ts`, `src/lib/auth.ts`. |
| Email | **Nodemailer → Gmail SMTP** (app password) | Sends announcements + verification/invite/reset mails. |
| Files | **Google Drive via service account** (`googleapis`) | Music + document vault storage; PDF preview proxied through the app. |
| Jobs | **In-process scheduler (node-cron) polling a DB queue every minute** | Scheduled announcement sends + throttled per-recipient delivery; survives restarts because state lives in Postgres. |
| TLS / proxy | **Caddy** in front of the Node app | Automatic HTTPS for the user's domain; simplest reverse proxy. Runs as its own systemd service. |
| Secrets at rest | **AES-256-GCM** via Node `crypto`, key from env (`APP_ENCRYPTION_KEY`) | Encrypts Gmail app password and service-account JSON before DB insert. |

Process model: `drummajor-portal.service` (Next.js) + `postgresql.service` + `caddy.service`,
all managed by systemd. App reads config (DB URL, encryption key, base URL) from an env file
referenced by the unit (`EnvironmentFile=`).

---

## Security Model (roles & permissions)

- **Admin** (head drum major + directors): invite anyone incl. admins, edit any user, change
  roles, manage SMTP/Drive/approval settings, view audit log, **impersonate users**
  (discreet) and **God-mode edit** of any user's name/email/password. The first wizard user
  is the initial admin; admin can be **transferred**; only admins create admins.
- **Drum Major:** announcements, music upload, events, tasks, notes, rosters, invite *other
  drum majors* (not admins). No impersonation, no God mode, cannot edit others' credentials.
- **Librarian:** music library + Drive folders/metadata only. No announcements, users,
  settings, or audit access.

Cross-cutting:
- Email-domain allowlist enforced at invite acceptance and any email change.
- Personal settings page (all users): change password (requires current password), change
  email (requires password + verification of the new address), forgot-password reset from
  the login screen, active-session list with "log out other devices."
- **Audit log (public to admins):** uploads, sends, deletes, role changes, etc.
- **Security log (separate, admin-only):** impersonation events live here, *excluded* from
  the normal audit log, so accidental changes during impersonation are still accountable.

---

## ⚠️ Two technical caveats to resolve at setup (flagged up front)

1. **Google Drive service-account storage quota.** A bare service account has no usable My
   Drive storage quota — uploads it "owns" can fail. Fix one of two ways during the Drive
   setup step: **(a)** use a **Shared Drive** (requires Google Workspace) and add the service
   account as a member, or **(b)** enable **domain-wide delegation** so the service account
   impersonates the band's Workspace user. The wizard will detect which is available and guide
   the user. If only a consumer Gmail (no Workspace) exists, we fall back to OAuth on the band
   account instead of a service account. *Confirm Workspace status during Stage 4.*
2. **Gmail sending limits.** Consumer Gmail = ~500 recipients/day; Workspace = ~2,000/day.
   Open-tracking pixels require **one individual message per recipient** (≈150 per "Everyone"
   send). Workspace easily covers this; consumer Gmail allows ~3 full sends/day. The send
   queue throttles delivery (e.g. a few per second) and surfaces remaining daily quota.

---

## Data Model (core tables)

`Organization` (name, band name, slug, base URL) · `User` (name, email, role, grad year,
instrument, photo, passwordHash, emailVerified) · `Invite` (token, email, role, invitedBy,
expiresAt) · `Session` · `AppSettings` (encrypted smtp config, encrypted drive config,
approvalRequired flag) · `Contact` (name, email, instrument, grade) · `Group` +
`ContactGroup` (many-to-many; built-in Marching/Concert/Jazz + custom) · `Announcement`
(subject, body, status: draft/scheduled/pending/sent, scheduledAt, authorId) ·
`AnnouncementRecipientGroup` · `AnnouncementMusic` · `EmailDelivery` (per-recipient: sent,
openedAt — drives tracking pixel) · `MusicPiece` (title, composer, arranger, ensemble, tags,
notes, driveFolderId) · `MusicFile` (filename, driveFileId, version) · `Event` (title, desc,
date, time, notify) · `Task` (title, status, assigneeId) · `Note` (text, color, category,
x, y, anonymous, authorId) + `NoteVote` + `NoteComment` · `VaultDocument` ·
`Notification` (userId, type, payload, readAt) · `AuditLog` · `SecurityLog`.

---

## Staged Delivery

### Stage 0 — Project skeleton & server bring-up
- Scaffold Next.js + TS + Tailwind + shadcn/ui; add Prisma; create `docs/plan.md` mirror.
- Provision the music-dept server: install Node (LTS) and PostgreSQL natively; create DB +
  role; install Caddy.
- Write `drummajor-portal.service` systemd unit + `EnvironmentFile`; Caddyfile pointing the
  user's domain at `localhost:3000` with auto-TLS.
- AES-256-GCM encrypt/decrypt helpers; `APP_ENCRYPTION_KEY` generated and stored in env file.
- **Verify:** `systemctl status` shows the service active; the domain serves a placeholder
  page over HTTPS.

### Stage 1 — Auth, first-run wizard, invites, roles  *(MVP core)*
- **First-run wizard:** Step 1 create org (school/band/slug + web address). Step 2 create
  first admin (name, school email, password). Step 3 SMTP config (smtp.gmail.com:587, band
  email, app password) with a **"send test email" button** — store encrypted. Step 4 Drive
  service-account JSON upload + access test + create root "Band Library" folder (handles the
  Shared-Drive / delegation caveat above).
- Hand-rolled credentials login; bcrypt password hashing; DB-backed sessions (custom `Session` table).
- **Invite flow:** admin/DM generates invite → email "John Doe invited you to the Drum Major
  Portal" with link → invitee fills details → **email-domain allowlist check** → verification
  email → access granted. Role selectable by inviter (DMs can't invite admins).
- **Personal settings page:** profile, change password (current-password gated), change email
  (password + verify new), forgot-password reset, active sessions / log-out-other-devices.
- **Admin tools:** edit any user, change roles, transfer admin, **God-mode** credential edit,
  **impersonation** (discreet banner, logs to SecurityLog only).
- **Verify:** complete the wizard end-to-end on a clean DB; invite + accept a second user;
  reject a non-allowlisted domain; reset a password; impersonate and confirm it appears in
  SecurityLog but not AuditLog.

### Stage 2 — Rosters & groups  *(MVP)*
- Contacts CRUD; built-in groups (Everyone / Marching / Concert / Jazz) + custom groups;
  multi-group membership.
- **CSV import** (`Name,Email,Instrument,Group`) with validation + dedupe preview.
- **Verify:** import a sample CSV of ~150 rows; assign a contact to two groups; confirm
  "Everyone" resolves to the full unique list.

### Stage 3 — Announcement center  *(MVP, highest-value)*
- Composer: subject + rich-text body; **multi-select recipient groups**; drafts; **schedule
  now/later**; optional **approval workflow** (admin setting, off by default → pending queue).
- **Sending:** per-recipient send via the throttled queue; **invisible tracking pixel** per
  recipient → Delivered/Opened counts (e.g. "Opened 112/150"); sent **history** with date,
  author, recipients, subject, status. **Announcement templates** (competition/uniform/etc.).
- **Verify:** save a draft; schedule a send 2 min out and confirm the cron picks it up; send
  to a test group and confirm open-pixel registers; confirm approval queue blocks/release.

### Stage 4 — Music library (Google Drive)  *(MVP)*
- "Add Piece" → creates a **per-piece Drive folder** under Band Library, uploads PDFs, saves
  metadata (title/composer/arranger/ensemble/tags/notes — blanks allowed; best-effort
  auto-fill is low priority). Auto-share folders with drum majors (manual override available).
- Search by title/composer/arranger/tags; **inline PDF preview** proxied through the app;
  **upload/edit/replace (versioning)**.
- **Attach music in announcements:** dropdown of catalog by name → small files attached as a
  **copy** (<25MB Gmail cap); large files inserted as **shared Drive links** with correct
  permissions; clean email formatting.
- **Verify:** add a multi-file piece; preview a PDF in-app; search finds it; attach it to a
  test announcement and confirm small=attachment, large=link, both openable by a recipient.

### Stage 5 — Dashboard & notifications  *(MVP)*
- Home "what needs attention today": upcoming events, recent announcements, new music,
  assigned tasks, notifications, sticky-note peek.
- **Events** (title/desc/date/time + "Notify users?" → triggers an announcement on save) and
  **Tasks** (Kanban To Do / In Progress / Completed, assignable).
- **In-app notification center** (bell): new announcement / task / music / comment / vote;
  selected events also email.
- **Verify:** create an event with notify on → confirm email + dashboard widget; assign a
  task → assignee gets a notification; bell unread count updates.

> **End of MVP.** Stages 6–9 follow after the portal is in real use.

### Stage 6 — Sticky-note idea board
- Draggable board (desktop) like a Post-it wall; color + category; **author shown by default
  with a "hide author" toggle**; **upvote** button + count; **comments** thread on click
  (distinctive styling). **Mobile:** scrollable card list instead of drag-and-drop.

### Stage 7 — Document vault
- Drive-backed store separate from music: handbooks, parade routes, agendas, packets,
  budgets. Upload/preview/organize.

### Stage 8 — Audit & security logs (full)
- Surface the public audit log (admin view) and the separate admin-only security log
  (impersonation). Filtering/search.

### Stage 9 — Leadership handoff center
- Year-over-year "what worked / didn't / tips" notes + archive of past announcements, music,
  schedules — institutional memory for new drum major classes.

---

## End-to-End Verification (per stage and at MVP cutover)

1. Fresh DB + fresh server: run the systemd service, complete the first-run wizard, confirm
   HTTPS on the real domain.
2. Invite → accept → verify a second user; confirm role permissions (DM can't invite admin;
   librarian sees only music).
3. Import roster CSV; compose, schedule, and send a real announcement with a music attachment
   to a small test group; confirm open tracking and history.
4. Restart the service mid-schedule; confirm a queued scheduled send still fires (state in DB).
5. Smoke-test impersonation logging separation (SecurityLog vs AuditLog).

## Ops notes
- Backups: nightly `pg_dump` via a systemd timer; Drive holds the actual files.
- Secrets: `APP_ENCRYPTION_KEY` and DB creds live only in the systemd `EnvironmentFile`
  (root-readable). Rotating the key requires re-encrypting stored secrets (document the steps).
- Confirm **Google Workspace vs consumer Gmail** early (Stage 4 caveat) — it determines Drive
  storage approach and daily email limits.

## Open items to confirm during build
- Workspace status of the band Google account (drives the Drive + email-limit approach).
- Exact domain + whether DNS is already pointed at the server's IP.
- Whether directors should receive in-app notifications or email-only.

---

## Implementation Status (living log)

### Stage 0 — Project skeleton & server bring-up — IN PROGRESS
- [x] Scaffolded Next.js 16 + TypeScript + Tailwind (App Router, `src/`, `@/*` alias)
- [x] Standardized on Node 22 LTS via nvm (`.nvmrc`); current tooling requires ≥20.19
- [x] Prisma 7 added; full core data model written in `prisma/schema.prisma` (validated)
- [x] Prisma client singleton with pg driver adapter (`src/lib/prisma.ts`)
- [x] AES-256-GCM secret encryption helpers (`src/lib/crypto.ts`) — round-trip tested
- [x] Deploy artifacts: `deploy/drummajor-portal.service`, `deploy/Caddyfile`,
      `deploy/README.md`, `.env.example`
- [x] Initial migration generated offline (`prisma/migrations/0_stage1_init/`) — apply
      with `prisma migrate deploy`
- [ ] Server provisioning (Node/Postgres/Caddy install) — done on the music-dept
      server by the user following `deploy/README.md`
- [ ] First migration applied against a live Postgres (needs a running DB)

> Note: actual server bring-up (installing Postgres/Caddy, running the systemd
> service against the real domain) happens on the music-department server, not on
> the dev machine. Configs are ready in `deploy/`.

### Stage 1 — Auth, first-run wizard, invites, roles — CODE COMPLETE (runtime E2E pending a DB)

Decision: **hand-rolled sessions, not Auth.js** (see Tech-Stack row). UI on **shadcn/ui**
(base-nova / @base-ui). Next 16 specifics used: `proxy.ts` (not middleware), async
`cookies()`/`params`, Server Actions + `useActionState`.

- [x] Deps: `nodemailer`, `zod`, `googleapis`, shadcn/ui initialized + components added
- [x] Core libs: `session.ts`, `auth.ts`, `impersonation.ts`, `email.ts`, `tokens.ts`,
      `allowlist.ts`, `audit.ts`, `validation.ts`, `settings.ts`, `roles.ts`, `password.ts`,
      `form.ts`
- [x] First-run wizard `src/app/setup/` — 4 steps (org → first admin → SMTP+test send →
      Drive upload, skippable); step derived from DB; finishes by logging admin in
- [x] Auth: `/login`, logout, `/forgot-password`, `/reset-password/[token]` (`(public)/actions.ts`)
- [x] Invite + verify: `(public)/invite/[token]`, `(public)/verify-email/[token]`,
      allowlist enforced at acceptance + email change; DM can't invite admins
- [x] Personal settings `(app)/settings` — profile, change password (current-pw gated),
      change email (verify new), active sessions + log-out-other-devices
- [x] Admin tools `(app)/admin/users` — edit, role change (last-admin guard), transfer admin,
      god-mode creds (→ AuditLog), impersonation (→ SecurityLog only, discreet banner)
- [x] Invites UI `(app)/invites` (admin + drum major)
- [x] `proxy.ts` light auth gate; `(app)` layout + `requireRole` do real authz; root routes
      to setup/dashboard/login
- [x] `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean
- [x] **Zero-install dev DB**: in-process **PGlite** (no Postgres/Docker to install). When
      `DATABASE_URL` is unset, `src/lib/prisma.ts` uses PGlite persisted to `./.pglite`; the
      `predev` hook (`scripts/dev-db.mjs`) applies `0_stage1_init` once. PGlite is in
      `serverExternalPackages` (next.config.ts) so it isn't bundled. Prod is unchanged: set
      `DATABASE_URL` and it uses `@prisma/adapter-pg`. Dev-only fallback encryption key in
      `crypto.ts` when `APP_ENCRYPTION_KEY` is unset and not production.
- [x] Runtime smoke: `npm run dev` boots on PGlite; `/` → `/setup`, wizard renders, proxy +
      layout gating redirect correctly, Prisma reads work.
- [ ] **Full click-through E2E** (complete wizard → invite/accept → reject bad domain → reset →
      impersonate logging) — do in a browser; flows that send mail need real Gmail SMTP creds.

To run locally now: just `npm install && npm run dev` (PGlite auto-creates `.pglite`). To use a
real Postgres instead, set `DATABASE_URL` and `npx prisma migrate deploy`.

### Stage 2 — Rosters & groups — CODE COMPLETE

- [x] Contacts CRUD, built-in + custom groups, multi-group membership (`(app)/rosters`)
- [x] Group utilities `src/lib/groups.ts` (Everyone virtual, `resolveGroupMemberIds`)
- [x] CSV import: hand-rolled parser `src/lib/csv.ts`, two-phase preview/commit,
      dedupe, now parses the optional **Grade** column (`Name,Email,Instrument,Grade,Group`)

### Stage 3 — Announcement center — CODE COMPLETE (live send pending Gmail SMTP)

- [x] `src/lib/sanitize.ts` — allowlist HTML sanitizer for bodies
- [x] `src/lib/announce.ts` — `resolveRecipients`, `enqueueAnnouncement`,
      `approveAnnouncement`, `processQueue` (throttled, idempotent, restart-safe;
      small music = Gmail attachment, large = shared Drive link)
- [x] `src/lib/email.ts` — `announcementEmail()` builder with per-recipient pixel
- [x] In-process scheduler: `src/lib/scheduler.ts` + `src/instrumentation.ts`
      (node-cron, every minute, Node-runtime only)
- [x] Composer `(app)/announcements/new` — lightweight editor
      (`src/components/rich-text.tsx`), recipient groups, music attach, templates,
      Send now / Schedule / Save draft; approval routes to PENDING_APPROVAL when
      `AppSettings.approvalRequired`
- [x] History list, detail (counts + admin Approve/release), draft delete
- [x] Open-tracking pixel `src/app/t/[token]/route.ts` → sets `EmailDelivery.openedAt`
- [ ] Live Gmail delivery + browser open round-trip — verify on the server with real SMTP

### Stage 4 — Music library (Google Drive) — CODE COMPLETE (live Drive pending creds)

- [x] `src/lib/drive.ts` — service-account JWT client; `ensureRootFolder`,
      `createFolder`, `uploadFile`, `getFileBuffer`, `getFileStream`,
      `shareAnyoneWithLink`, `shareWithUser`; `supportsAllDrives`; guarded when unconfigured
- [x] `(app)/music` — search (title/composer/arranger/tags), add piece (per-piece
      Drive folder + multi-PDF upload), edit metadata, add/replace files (versioning)
- [x] Inline PDF preview via auth-gated proxy `(app)/music/[id]/file/[fileId]/route.ts`
- [x] Music attachment wired into `processQueue` (small=attach, large=link)
- [ ] Live upload/preview against a real Drive service account — verify on the server

### Stage 5 — Dashboard, events, tasks, notifications — CODE COMPLETE

- [x] `src/lib/notify.ts` — create / notifyUsers / notifyAll / unreadCount / markAllRead
- [x] Events `(app)/events` — create/delete; "Notify everyone" creates an Everyone
      announcement (reuses Stage 3 queue) + in-app notification
- [x] Tasks `(app)/tasks` — Kanban (To Do / In Progress / Completed), assignable,
      assignee gets a notification
- [x] Notification bell + unread count in `(app)/layout.tsx`; `(app)/notifications`
      list + mark-all-read; wired for new announcement / task assigned / new music / event
- [x] Dashboard `(app)/dashboard` — upcoming events, recent announcements, new music,
      my tasks, unread count
- [x] Nav links (Announcements, Music [+Librarian], Events, Tasks) + `proxy.ts` matcher

> **MVP (Stages 1–5) code complete.** `npx tsc --noEmit`, `npm run build`, `npm run lint`
> all clean; dev server boots on PGlite, scheduler starts, tracking pixel serves a valid
> 1×1 GIF. Remaining verification (real Gmail send, Drive upload/preview, open round-trip)
> runs on the music-dept server with live SMTP + service-account creds.

### Stage 6 — Sticky-note idea board — CODE COMPLETE

- [x] Schema already had `Note`/`NoteVote`/`NoteComment`; no migration needed
- [x] `(app)/notes` — `actions.ts` (create, drag-persist position, delete, toggle vote,
      add comment), server `page.tsx`, client `board.tsx`
- [x] Desktop: draggable Post-it wall (pointer events, position persisted on drag end via
      a bound server action). Mobile: scrollable card list (`md:hidden`)
- [x] Color picker + category + "hide my name" (anonymous) toggle; upvote button + count;
      comment thread in a dialog (`@base-ui` Dialog)
- [x] Vote/comment notify the note author (`NOTE_VOTE`/`NOTE_COMMENT`); notifications page
      labels added; dashboard gains a "Top ideas" peek (ordered by vote count)
- [x] Gated to Admin + Drum Major; nav link "Ideas"; `proxy.ts` matcher `/notes`

### Stage 7 — Document vault (Google Drive) — CODE COMPLETE (live Drive pending creds)

- [x] Migration `1_stage6_9`: `AppSettings.vaultRootFolderId`, `VaultDocument.uploadedById`
- [x] `src/lib/drive.ts` — `ensureVaultFolder()` lazily creates a "Document Vault" folder
      under the Band Library root (kept separate from per-piece music folders)
- [x] `(app)/vault` — upload (any file type), list grouped by category, search
      (title/category/filename), delete; auth-gated preview proxy `[id]/file/route.ts`
- [x] Gated to Admin + Drum Major; nav link "Vault"; `proxy.ts` matcher `/vault`

### Stage 8 — Audit & security logs (full) — CODE COMPLETE

- [x] `(app)/audit` (admin-only) — two link "tabs": **Activity** (public `AuditLog`) and
      **Security** (impersonation-only `SecurityLog`, kept separate per the Security Model)
- [x] Free-text search across action / target / person; humanized action labels; 100-row cap
- [x] Nav link "Logs" (admin); `proxy.ts` matcher `/audit`

### Stage 9 — Leadership handoff center — CODE COMPLETE

- [x] Migration `1_stage6_9`: new `HandoffNote` model (year, category, title, bodyHtml,
      author) + `year` index
- [x] `(app)/handoff` — add note (year + What worked/What didn't/Tip + RichText body,
      sanitized server-side), list grouped by year with category badges, author/admin delete
- [x] "Archive" card linking to past announcements / music / events with counts
- [x] Gated to Admin + Drum Major; nav link "Handoff"; `proxy.ts` matcher `/handoff`

> **Dev DB tooling:** `scripts/dev-db.mjs` now applies every `prisma/migrations/*` in order
> once (tracked in a `_dev_migrations` table), so PGlite picks up `1_stage6_9` automatically.
>
> **Stages 6–9 code complete.** `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean;
> dev server boots on PGlite with the new migration applied; `/notes`, `/vault`, `/audit`,
> `/handoff` all serve (auth-gated). Live Drive upload/preview for the vault verifies on the
> server with real service-account creds (same caveat as Stage 4).
