-- Library merge: unify Music + Vault into a single Drive-backed file tree.

-- CreateEnum
CREATE TYPE "LibraryItemType" AS ENUM ('FOLDER', 'FILE');

-- CreateEnum
CREATE TYPE "SyncState" AS ENUM ('PENDING', 'SYNCED', 'ERROR');

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LibraryItemType" NOT NULL,
    "parentId" TEXT,
    "driveId" TEXT,
    "webViewLink" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "note" TEXT,
    "syncState" "SyncState" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "stagedPath" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryItem_parentId_idx" ON "LibraryItem"("parentId");

-- CreateIndex
CREATE INDEX "LibraryItem_syncState_idx" ON "LibraryItem"("syncState");

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: migrate existing Music + Vault data into the tree.
-- IDs are derived from source ids (mp_/mf_/vd_/cat_) so they stay unique and
-- so AnnouncementMusic can be repointed to each piece's new folder.
-- ---------------------------------------------------------------------------

-- Root "Music" folder (mapped to the existing Drive root folder, if any).
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "driveId", "syncState", "updatedAt")
SELECT 'lib_root_music', 'Music', 'FOLDER', NULL,
       (SELECT "driveRootFolderId" FROM "AppSettings" LIMIT 1),
       'SYNCED', CURRENT_TIMESTAMP;

-- Root "Documents" folder (mapped to the existing Drive vault folder, if any).
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "driveId", "syncState", "updatedAt")
SELECT 'lib_root_docs', 'Documents', 'FOLDER', NULL,
       (SELECT "vaultRootFolderId" FROM "AppSettings" LIMIT 1),
       'SYNCED', CURRENT_TIMESTAMP;

-- Each music piece becomes a folder under Music. Extra metadata -> note.
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "driveId", "note", "syncState", "createdAt", "updatedAt")
SELECT 'mp_' || "id", "title", 'FOLDER', 'lib_root_music', "driveFolderId",
       NULLIF(trim(concat_ws(' · ', "composer", "arranger", "ensemble")), ''),
       'SYNCED', "createdAt", "updatedAt"
FROM "MusicPiece";

-- Each music file becomes a file inside its piece folder.
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "driveId", "sizeBytes", "syncState", "createdAt", "updatedAt")
SELECT 'mf_' || "id", "filename", 'FILE', 'mp_' || "musicPieceId", "driveFileId",
       "sizeBytes", 'SYNCED', "createdAt", CURRENT_TIMESTAMP
FROM "MusicFile";

-- Each distinct vault category becomes a folder under Documents.
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "syncState", "updatedAt")
SELECT 'cat_' || md5("category"), "category", 'FOLDER', 'lib_root_docs', 'PENDING', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "VaultDocument" WHERE "category" IS NOT NULL AND "category" <> '') c;

-- Each vault document becomes a file (inside its category folder, else under Documents).
INSERT INTO "LibraryItem" ("id", "name", "type", "parentId", "driveId", "uploadedById", "syncState", "createdAt", "updatedAt")
SELECT 'vd_' || "id", "title", 'FILE',
       CASE WHEN "category" IS NOT NULL AND "category" <> '' THEN 'cat_' || md5("category") ELSE 'lib_root_docs' END,
       "driveFileId", "uploadedById", 'SYNCED', "createdAt", "updatedAt"
FROM "VaultDocument";

-- ---------------------------------------------------------------------------
-- Repoint AnnouncementMusic from MusicPiece to the new LibraryItem folders.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "AnnouncementMusic" DROP CONSTRAINT "AnnouncementMusic_musicPieceId_fkey";
ALTER TABLE "AnnouncementMusic" DROP CONSTRAINT "AnnouncementMusic_pkey";
ALTER TABLE "AnnouncementMusic" ADD COLUMN "libraryItemId" TEXT;
UPDATE "AnnouncementMusic" SET "libraryItemId" = 'mp_' || "musicPieceId";
ALTER TABLE "AnnouncementMusic" ALTER COLUMN "libraryItemId" SET NOT NULL;
ALTER TABLE "AnnouncementMusic" DROP COLUMN "musicPieceId";
ALTER TABLE "AnnouncementMusic" ADD CONSTRAINT "AnnouncementMusic_pkey" PRIMARY KEY ("announcementId", "libraryItemId");
ALTER TABLE "AnnouncementMusic" ADD CONSTRAINT "AnnouncementMusic_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "LibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Drop the old tables.
-- ---------------------------------------------------------------------------

-- DropTable
DROP TABLE "MusicFile";

-- DropTable
DROP TABLE "MusicPiece";

-- DropTable
DROP TABLE "VaultDocument";
