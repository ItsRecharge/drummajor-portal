-- Music catalog: structured piece metadata over the Drive tree, push backoff,
-- and the Drive id of the regenerated index.csv.
CREATE TYPE "MusicCategory" AS ENUM ('CONCERT_BAND', 'JAZZ_BAND', 'MARCHING_BAND', 'MISCELLANEOUS', 'MUSICAL', 'ORCHESTRA', 'SOLO_ENSEMBLE');
CREATE TYPE "CreditType" AS ENUM ('ARRANGER', 'COMPOSER');

CREATE TABLE "MusicPiece" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credit" TEXT,
    "creditType" "CreditType",
    "category" "MusicCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicPiece_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MusicPiece_folderId_key" ON "MusicPiece"("folderId");
CREATE INDEX "MusicPiece_category_idx" ON "MusicPiece"("category");
CREATE INDEX "MusicPiece_title_idx" ON "MusicPiece"("title");

ALTER TABLE "MusicPiece" ADD CONSTRAINT "MusicPiece_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "LibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryItem" ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN "driveIndexFileId" TEXT;
