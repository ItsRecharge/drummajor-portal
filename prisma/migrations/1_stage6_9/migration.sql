-- Stage 7 (document vault) + Stage 9 (leadership handoff) schema additions.

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "vaultRootFolderId" TEXT;

-- AlterTable
ALTER TABLE "VaultDocument" ADD COLUMN "uploadedById" TEXT;

-- CreateTable
CREATE TABLE "HandoffNote" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoffNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandoffNote_year_idx" ON "HandoffNote"("year");

-- AddForeignKey
ALTER TABLE "VaultDocument" ADD CONSTRAINT "VaultDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoffNote" ADD CONSTRAINT "HandoffNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
