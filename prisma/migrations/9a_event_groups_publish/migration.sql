-- Events can expect several class lists (EventGroup rows; none = Everyone), and
-- attendance sheets are published explicitly: absence emails go out only after a
-- drum major publishes (no more 30-minute grace period).

CREATE TABLE "EventGroup" (
    "eventId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "EventGroup_pkey" PRIMARY KEY ("eventId", "groupId")
);

CREATE INDEX "EventGroup_groupId_idx" ON "EventGroup"("groupId");

ALTER TABLE "EventGroup" ADD CONSTRAINT "EventGroup_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventGroup" ADD CONSTRAINT "EventGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over the single class list each event had.
INSERT INTO "EventGroup" ("eventId", "groupId")
  SELECT "id", "attendanceGroupId" FROM "Event" WHERE "attendanceGroupId" IS NOT NULL;

ALTER TABLE "Event" DROP CONSTRAINT "Event_attendanceGroupId_fkey";
ALTER TABLE "Event" DROP COLUMN "attendanceGroupId";

ALTER TABLE "Event" ADD COLUMN "attendancePublishedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "attendancePublishedById" TEXT;
ALTER TABLE "Event" ADD CONSTRAINT "Event_attendancePublishedById_fkey"
  FOREIGN KEY ("attendancePublishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sheets saved under the old flow were final: treat them as published so the
-- worker's new rule neither strands nor re-queues their absence emails.
UPDATE "Event" SET "attendancePublishedAt" = "attendanceTakenAt"
  WHERE "attendanceTakenAt" IS NOT NULL AND "attendancePublishedAt" IS NULL;
