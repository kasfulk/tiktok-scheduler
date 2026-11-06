-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountPostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyPostingLimit" INTEGER NOT NULL DEFAULT 3,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "activeDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountPostingSettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TikTokAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountPostingSettings" ("accountId", "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "dailyPostingLimit", "enabled", "id", "minimumIntervalMinutes", "timezone", "updatedAt") SELECT "accountId", "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "dailyPostingLimit", "enabled", "id", "minimumIntervalMinutes", "timezone", "updatedAt" FROM "AccountPostingSettings";
DROP TABLE "AccountPostingSettings";
ALTER TABLE "new_AccountPostingSettings" RENAME TO "AccountPostingSettings";
CREATE UNIQUE INDEX "AccountPostingSettings_accountId_key" ON "AccountPostingSettings"("accountId");
CREATE TABLE "new_PostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enableDailyLimit" BOOLEAN NOT NULL DEFAULT true,
    "dailyPostingLimit" INTEGER NOT NULL DEFAULT 5,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "activeDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "limitScope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "defaultSchedulingMode" TEXT NOT NULL DEFAULT 'INTERVAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostingSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PostingSettings" ("activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "dailyPostingLimit", "defaultSchedulingMode", "enableDailyLimit", "id", "limitScope", "minimumIntervalMinutes", "timezone", "updatedAt", "userId") SELECT "activeDays", "activeHoursEnd", "activeHoursStart", "createdAt", "dailyPostingLimit", "defaultSchedulingMode", "enableDailyLimit", "id", "limitScope", "minimumIntervalMinutes", "timezone", "updatedAt", "userId" FROM "PostingSettings";
DROP TABLE "PostingSettings";
ALTER TABLE "new_PostingSettings" RENAME TO "PostingSettings";
CREATE UNIQUE INDEX "PostingSettings_userId_key" ON "PostingSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
