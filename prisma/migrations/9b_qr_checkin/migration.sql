-- QR self check-in (beta): admin toggle + radius on AppSettings, a per-event
-- open/close session with the drum major's GPS anchor on Event, one CheckIn row
-- per phone per event, and a checkedInAt stamp on AttendanceRecord.

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "checkInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkInRadiusM" INTEGER NOT NULL DEFAULT 150;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "checkInAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "checkInClosedAt" TIMESTAMP(3),
ADD COLUMN     "checkInLat" DOUBLE PRECISION,
ADD COLUMN     "checkInLng" DOUBLE PRECISION,
ADD COLUMN     "checkInOpenedAt" TIMESTAMP(3),
ADD COLUMN     "checkInOpenedById" TEXT,
ADD COLUMN     "checkInRadiusM" INTEGER;

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckIn_eventId_contactId_idx" ON "CheckIn"("eventId", "contactId");

-- CreateIndex
CREATE INDEX "CheckIn_contactId_idx" ON "CheckIn"("contactId");

-- CreateIndex
CREATE INDEX "CheckIn_deviceId_idx" ON "CheckIn"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_eventId_deviceId_key" ON "CheckIn"("eventId", "deviceId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_checkInOpenedById_fkey" FOREIGN KEY ("checkInOpenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

