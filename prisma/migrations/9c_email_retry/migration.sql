-- Retry temporary SMTP errors (Gmail throttling) instead of recording them as
-- failures: per-delivery try count and the time the next try is due.

-- AlterTable
ALTER TABLE "EmailDelivery" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);
