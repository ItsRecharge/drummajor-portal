# Design: Library merge, sticky-note redesign, announcements rename

Date: 2026-06-26
Status: Approved

## Context

The drummajor-portal has separate **Music** and **Vault** features, both backed by Google
Drive storage. The user wants them merged into a single Google-Drive-style file browser
("Library") with a master folder containing music and other files. Files are not previewed
in-app — items link out to Google Drive, which renders them. Alongside this, the sticky-note
"Ideas" board should look more like real (rotated, draggable) sticky notes, and the
"Announcements" feature should be relabeled "Email Announcements".

Three independent sub-projects, ordered by size:

1. **Library** — merge Music + Vault into a Drive-style browser (the bulk of the work).
2. **Sticky notes** — visual redesign of the existing draggable board.
3. **Announcements rename** — label-only change.

## Decisions (from brainstorming)

- **Browser style**: true Drive-like folder tree (option 1).
- **Music pieces**: a piece becomes a **folder**; its PDFs are files inside. Extra metadata
  (composer/arranger/etc.) is casual — folded into the folder name or a `note` field, not a
  structured panel.
- **Source of truth**: our **DB holds the file tree** (local cache, assumed correct for
  browsing). Uploads are staged on our server, recorded in the DB immediately (visible at
  once), then **pushed to Drive by a background worker** (write-back cache). A periodic +
  on-demand **Refresh from Drive** reconciles the cache.
- **Viewing**: not a data-viewing site. Each file/folder **links to Google Drive**
  (`webViewLink`); Drive renders. No in-app PDF/image streaming.
- **Access**: whole Library = Admin / Drum Major / Librarian.
- **Announcement link**: keep the ability to attach music — now attaches the **music folder**
  (a `LibraryItem`); recipients get the Drive link; folder is shared so they can open it.
- **Vault categories** migrate under a root **Documents** folder.
- **Sticky-note rotation**: derived deterministically from the note id (±~4°), no schema change.

## 1. Library

### Data model

One self-referential tree table replaces `MusicPiece`, `MusicFile`, `VaultDocument`:

```prisma
enum LibraryItemType { FOLDER FILE }
enum SyncState       { PENDING SYNCED ERROR }

model LibraryItem {
  id           String          @id @default(cuid())
  name         String
  type         LibraryItemType
  parentId     String?
  parent       LibraryItem?    @relation("Tree", fields: [parentId], references: [id], onDelete: Cascade)
  children     LibraryItem[]   @relation("Tree")
  driveId      String?         // Drive file/folder id (null until pushed)
  webViewLink  String?         // open-in-Drive link (null until pushed)
  mimeType     String?
  sizeBytes    BigInt?
  note         String?         // leftover music metadata (e.g. composer/arranger)
  syncState    SyncState       @default(PENDING)
  stagedPath   String?         // server temp file awaiting push (FILE only)
  uploadedById String?
  uploadedBy   User?           @relation(fields: [uploadedById], references: [id])
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  announcementLinks AnnouncementMusic[]

  @@index([parentId])
  @@index([syncState])
}
```

### One-time migration (Prisma migration + data backfill)

- Create root `Music` folder (`SYNCED`, `driveId` = existing `AppSettings.driveRootFolderId`).
- Each `MusicPiece` → `FOLDER` under `Music` (name = title; composer/arranger → `note`),
  `driveId` = `piece.driveFolderId`, `SYNCED`. Each `MusicFile` → `FILE` child
  (`driveId` = `driveFileId`, `name` = filename). `webViewLink` filled lazily by the worker or
  on first open.
- Create root `Documents` folder. Each distinct vault `category` → `FOLDER` under `Documents`
  (uncategorized docs go directly under `Documents`). Each `VaultDocument` → `FILE`
  (`driveId` = `driveFileId`, `name` = filename).
- Re-point each `AnnouncementMusic` row from the piece to the piece's new `LibraryItem` folder.
- Drop `MusicPiece`, `MusicFile`, `VaultDocument` after backfill.

### Sync — write-back cache

Reuse the restart-safe node-cron pattern in [src/lib/scheduler.ts](src/lib/scheduler.ts).
New module `src/lib/library-sync.ts`:

- **Upload action**: write bytes to a staging dir (e.g. `.staging/<cuid>`), insert
  `LibraryItem` (`FILE`, `PENDING`, `stagedPath`, parent set), `revalidatePath` → visible
  immediately.
- **New-folder action**: insert `LibraryItem` (`FOLDER`, `PENDING`).
- **Worker** (`processPendingItems`, run on a short cron + kicked after each upload): for each
  `PENDING` item, oldest first, ensure the parent is `SYNCED` (has `driveId`), then
  `createFolder` / `uploadFile` to Drive under the parent's `driveId`; set `driveId` +
  `webViewLink` (via [shareAnyoneWithLink](src/lib/drive.ts#L145)); mark `SYNCED`; delete the
  staged file. On failure mark `ERROR` and retry with backoff.
- **Refresh from Drive** (manual action + periodic cron): walk the Drive tree under root; add
  items present in Drive but missing locally, flag/remove locally-present items deleted in
  Drive. Between refreshes the DB is treated as correct.
- **Delete action**: remove the DB subtree; delete from Drive (inline or via worker).

### UI

New route `/library` (Drive-style), styled in the current "Friday Night Lights" theme:

- Breadcrumb of the current path + a list/grid of the current folder's children.
- Folders navigate deeper (`/library/[id]` or `?folder=`); files open `webViewLink` in a new
  tab. `PENDING` items show an "Uploading…" state and are not yet clickable.
- Toolbar: **New folder**, **Upload files** (multi). Per-item menu: rename, delete,
  open in Drive.
- `/music` and `/vault` redirect to `/library`. Old file-streaming routes
  (`/music/[id]/file/[fileId]`, `/vault/[id]/file`) are removed (we link to Drive).
- Sidebar: replace the separate **Music** and **Vault** nav items with one **Library** item
  (shown to Admin/DM/Librarian).

### Access

All Library routes/actions guard `requireRole(ADMIN, DRUM_MAJOR, LIBRARIAN)`.

## 2. Announcement ↔ music link

- `AnnouncementMusic.musicPieceId` → `libraryItemId` (FK to `LibraryItem`); keep the
  `@@id([announcementId, libraryItemId])` shape. Field/relation renamed accordingly; the
  "music attachment" concept stays.
- Compose screen: attach a Library folder (browse/pick). Announcement view + outgoing email
  show it as a Drive link. The worker/share step ensures the attached folder is shared
  (`shareAnyoneWithLink`) so recipients can open it.

## 3. Sticky notes (`/notes`)

The board, drag, and `x`/`y` persistence already exist
([board.tsx](src/app/(app)/notes/board.tsx), `Note.x`/`Note.y`). Changes:

- **Rotation**: deterministic ±~4° per note derived from a hash of its id — applied as a CSS
  `rotate(...)` on the note (and straightened slightly on hover/active). No schema change.
- **Cooler look**: real sticky-paper styling — tape strip or folded corner, heavier drop
  shadow, subtle skew, hover lift, grab cursor. Stays within FNL tokens.
- **Board is the hero**: collapse the new-note form into a small floating "+ add note" so the
  board dominates.
- **Mobile**: make the draggable board work on touch (pointer events already support it)
  rather than falling back to a plain card list.

## 4. Announcements rename

Label-only → "Email Announcements": sidebar label
([app-sidebar.tsx](src/components/app-sidebar.tsx)), page `h1`
([announcements/page.tsx](src/app/(app)/announcements/page.tsx)), and the `<title>` metadata.
Routes and DB unchanged.

## Cleanup

Remove Music/Vault pages, forms, file-streaming routes, and the old Prisma models after the
migration backfill succeeds.

## Verification

- Run the migration + backfill; confirm existing pieces/docs appear in `/library` with their
  Drive links intact and announcement attachments still resolve.
- Upload a file → appears `PENDING` immediately → worker pushes to Drive → becomes clickable
  and opens in Drive. Create a folder. Delete an item. Run "Refresh from Drive".
- Attach a folder to an announcement; verify recipients can open the Drive link.
- Sticky notes render rotated, drag on desktop and mobile, persist position; the add form is a
  floating control.
- Sidebar/page/title read "Email Announcements".
- `npx tsc --noEmit` clean, `npm run lint` 0 errors, `npm run build` succeeds.
