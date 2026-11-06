-- Drop the daily posting limit entirely: scheduling is bounded by active hours and the slot
-- interval, never by a per-day quota.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedulingMode" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "startTime" TEXT,
    "intervalMinutes" INTEGER,
    "postingTimes" TEXT,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "scheduledCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleBatch" ("createdAt", "id", "intervalMinutes", "name", "postingTimes", "scheduledCount", "schedulingMode", "startDate", "startTime", "status", "timezone", "updatedAt", "userId") SELECT "createdAt", "id", "intervalMinutes", "name", "postingTimes", "scheduledCount", "schedulingMode", "startDate", "startTime", "status", "timezone", "updatedAt", "userId" FROM "ScheduleBatch";
DROP TABLE "ScheduleBatch";
ALTER TABLE "new_ScheduleBatch" RENAME TO "ScheduleBatch";
CREATE INDEX "ScheduleBatch_userId_createdAt_idx" ON "ScheduleBatch"("userId", "createdAt");
CREATE TABLE "new_PostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "activeDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultSchedulingMode" TEXT NOT NULL DEFAULT 'INTERVAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostingSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PostingSettings" ("activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "defaultSchedulingMode", "id", "minimumIntervalMinutes", "timezone", "updatedAt", "userId") SELECT "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "defaultSchedulingMode", "id", "minimumIntervalMinutes", "timezone", "updatedAt", "userId" FROM "PostingSettings";
DROP TABLE "PostingSettings";
ALTER TABLE "new_PostingSettings" RENAME TO "PostingSettings";
CREATE UNIQUE INDEX "PostingSettings_userId_key" ON "PostingSettings"("userId");
CREATE TABLE "new_AccountPostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "activeDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountPostingSettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TikTokAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountPostingSettings" ("accountId", "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "enabled", "id", "minimumIntervalMinutes", "timezone", "updatedAt") SELECT "accountId", "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "enabled", "id", "minimumIntervalMinutes", "timezone", "updatedAt" FROM "AccountPostingSettings";
DROP TABLE "new_AccountPostingSettings";
ALTER TABLE "new_AccountPostingSettings" RENAME TO "AccountPostingSettings";
CREATE UNIQUE INDEX "AccountPostingSettings_accountId_key" ON "AccountPostingSettings"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
