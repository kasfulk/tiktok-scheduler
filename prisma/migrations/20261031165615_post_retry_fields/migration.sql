-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduledPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "batchId" TEXT,
    "scheduledAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "externalPublishId" TEXT,
    "publishedPostId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "publishMethod" TEXT NOT NULL DEFAULT 'DIRECT_POST',
    "privacyLevel" TEXT NOT NULL DEFAULT 'PUBLIC_TO_EVERYONE',
    "publishedAt" DATETIME,
    "nextAttemptAt" DATETIME,
    "errorMessage" TEXT,
    "attemptStartedAt" DATETIME,
    "lockedBy" TEXT,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledPost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TikTokAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledPost_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScheduleBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScheduledPost" ("accountId", "attemptStartedAt", "batchId", "createdAt", "errorMessage", "externalPublishId", "id", "idempotencyKey", "lockedAt", "lockedBy", "maxRetries", "publishMethod", "publishedAt", "retryCount", "scheduledAt", "status", "timezone", "updatedAt", "videoId") SELECT "accountId", "attemptStartedAt", "batchId", "createdAt", "errorMessage", "externalPublishId", "id", "idempotencyKey", "lockedAt", "lockedBy", "maxRetries", "publishMethod", "publishedAt", "retryCount", "scheduledAt", "status", "timezone", "updatedAt", "videoId" FROM "ScheduledPost";
DROP TABLE "ScheduledPost";
ALTER TABLE "new_ScheduledPost" RENAME TO "ScheduledPost";
CREATE UNIQUE INDEX "ScheduledPost_idempotencyKey_key" ON "ScheduledPost"("idempotencyKey");
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");
CREATE INDEX "ScheduledPost_status_nextAttemptAt_idx" ON "ScheduledPost"("status", "nextAttemptAt");
CREATE INDEX "ScheduledPost_scheduledAt_idx" ON "ScheduledPost"("scheduledAt");
CREATE INDEX "ScheduledPost_accountId_scheduledAt_idx" ON "ScheduledPost"("accountId", "scheduledAt");
CREATE INDEX "ScheduledPost_videoId_idx" ON "ScheduledPost"("videoId");
CREATE INDEX "ScheduledPost_batchId_idx" ON "ScheduledPost"("batchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
