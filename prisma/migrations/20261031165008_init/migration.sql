-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultAccountId" TEXT,
    "telegramChatId" TEXT,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TikTokAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "refreshExpiresAt" DATETIME,
    "scopes" TEXT NOT NULL DEFAULT '',
    "connectionStatus" TEXT NOT NULL DEFAULT 'CONNECTED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TikTokAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "duration" REAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "processingError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
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
    "idempotencyKey" TEXT NOT NULL,
    "publishMethod" TEXT NOT NULL DEFAULT 'DIRECT_POST',
    "publishedAt" DATETIME,
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

-- CreateTable
CREATE TABLE "ScheduleBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedulingMode" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "startTime" TEXT,
    "intervalMinutes" INTEGER,
    "postingTimes" TEXT,
    "timezone" TEXT NOT NULL,
    "dailyPostingLimit" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "scheduledCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "enableDailyLimit" BOOLEAN NOT NULL DEFAULT true,
    "dailyPostingLimit" INTEGER NOT NULL DEFAULT 5,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
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

-- CreateTable
CREATE TABLE "AccountPostingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyPostingLimit" INTEGER NOT NULL DEFAULT 3,
    "minimumIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
    "activeHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "activeHoursEnd" TEXT NOT NULL DEFAULT '22:00',
    "activeDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6,0',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountPostingSettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TikTokAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledPostId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "requestMetadata" TEXT,
    "responseMetadata" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishingLog_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptionTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaptionTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokAccount_openId_key" ON "TikTokAccount"("openId");

-- CreateIndex
CREATE INDEX "TikTokAccount_userId_idx" ON "TikTokAccount"("userId");

-- CreateIndex
CREATE INDEX "TikTokAccount_connectionStatus_idx" ON "TikTokAccount"("connectionStatus");

-- CreateIndex
CREATE INDEX "Video_userId_status_idx" ON "Video"("userId", "status");

-- CreateIndex
CREATE INDEX "Video_userId_createdAt_idx" ON "Video"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPost_idempotencyKey_key" ON "ScheduledPost"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_scheduledAt_idx" ON "ScheduledPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_accountId_scheduledAt_idx" ON "ScheduledPost"("accountId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_videoId_idx" ON "ScheduledPost"("videoId");

-- CreateIndex
CREATE INDEX "ScheduledPost_batchId_idx" ON "ScheduledPost"("batchId");

-- CreateIndex
CREATE INDEX "ScheduleBatch_userId_createdAt_idx" ON "ScheduleBatch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostingSettings_userId_key" ON "PostingSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPostingSettings_accountId_key" ON "AccountPostingSettings"("accountId");

-- CreateIndex
CREATE INDEX "PublishingLog_scheduledPostId_createdAt_idx" ON "PublishingLog"("scheduledPostId", "createdAt");

-- CreateIndex
CREATE INDEX "PublishingLog_createdAt_idx" ON "PublishingLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CaptionTemplate_userId_idx" ON "CaptionTemplate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptionTemplate_userId_name_key" ON "CaptionTemplate"("userId", "name");
