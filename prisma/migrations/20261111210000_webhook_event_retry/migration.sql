-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "encryptedPayload" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "webhook_events_status_nextAttemptAt_idx" ON "webhook_events"("status", "nextAttemptAt");
