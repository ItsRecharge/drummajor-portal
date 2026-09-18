-- Attendance: per-student status for band events, plus which class list was
-- expected and when the sheet was last saved.
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "AttendanceRecord" (
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("eventId", "contactId")
);

CREATE INDEX "AttendanceRecord_contactId_idx" ON "AttendanceRecord"("contactId");

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD COLUMN "attendanceGroupId" TEXT;
ALTER TABLE "Event" ADD COLUMN "attendanceTakenAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD CONSTRAINT "Event_attendanceGroupId_fkey"
  FOREIGN KEY ("attendanceGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
