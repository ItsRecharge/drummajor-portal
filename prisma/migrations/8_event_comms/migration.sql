-- Event emails: per-event send log, monthly digest log, and the conflict
-- contacts shown in every event email.
CREATE TYPE "EventNoticeKind" AS ENUM ('ANNOUNCED', 'WEEK_BEFORE', 'THREE_DAYS_BEFORE', 'DAY_OF');

CREATE TABLE "EventNotice" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "EventNoticeKind" NOT NULL,
    "announcementId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventNotice_eventId_kind_key" ON "EventNotice"("eventId", "kind");

ALTER TABLE "EventNotice" ADD CONSTRAINT "EventNotice_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DigestLog" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "announcementId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigestLog_period_key" ON "DigestLog"("period");

ALTER TABLE "AppSettings" ADD COLUMN "absenceContactName" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "absenceContactEmail" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "absenceCcUserId" TEXT;
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_absenceCcUserId_fkey"
  FOREIGN KEY ("absenceCcUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the contact name; the admin enters the address and picks the CC'd
-- drum major in Settings (the sign-on prompt asks until one is set).
UPDATE "AppSettings" SET "absenceContactName" = 'Mr. Costello';
