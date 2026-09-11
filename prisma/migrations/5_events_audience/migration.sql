-- Events get an audience (whole band vs drum majors only), a location, and a creator.
CREATE TYPE "EventAudience" AS ENUM ('BAND', 'DRUM_MAJORS');

ALTER TABLE "Event" ADD COLUMN "audience" "EventAudience" NOT NULL DEFAULT 'BAND';
ALTER TABLE "Event" ADD COLUMN "location" TEXT;
ALTER TABLE "Event" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Event_audience_date_idx" ON "Event"("audience", "date");
