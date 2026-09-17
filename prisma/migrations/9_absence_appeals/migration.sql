-- Absence notices + appeals: when a student was emailed about an absence, their
-- personal appeal token, and the appeal itself.
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

ALTER TABLE "AttendanceRecord" ADD COLUMN "absenceEmailedAt" TIMESTAMP(3);
ALTER TABLE "AttendanceRecord" ADD COLUMN "appealToken" TEXT;
CREATE UNIQUE INDEX "AttendanceRecord_appealToken_key" ON "AttendanceRecord"("appealToken");

CREATE TABLE "AbsenceAppeal" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "AbsenceAppeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbsenceAppeal_eventId_contactId_key" ON "AbsenceAppeal"("eventId", "contactId");
CREATE INDEX "AbsenceAppeal_status_idx" ON "AbsenceAppeal"("status");

ALTER TABLE "AbsenceAppeal" ADD CONSTRAINT "AbsenceAppeal_eventId_contactId_fkey"
  FOREIGN KEY ("eventId", "contactId") REFERENCES "AttendanceRecord"("eventId", "contactId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AbsenceAppeal" ADD CONSTRAINT "AbsenceAppeal_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
