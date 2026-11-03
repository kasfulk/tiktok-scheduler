-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TikTokAccount" (
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
    "authMode" TEXT NOT NULL DEFAULT 'OAUTH',
    "browserSession" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'CONNECTED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TikTokAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TikTokAccount" ("accessToken", "avatarUrl", "connectionStatus", "createdAt", "displayName", "id", "isDefault", "lastSyncedAt", "openId", "refreshExpiresAt", "refreshToken", "scopes", "tokenExpiresAt", "updatedAt", "userId", "username") SELECT "accessToken", "avatarUrl", "connectionStatus", "createdAt", "displayName", "id", "isDefault", "lastSyncedAt", "openId", "refreshExpiresAt", "refreshToken", "scopes", "tokenExpiresAt", "updatedAt", "userId", "username" FROM "TikTokAccount";
DROP TABLE "TikTokAccount";
ALTER TABLE "new_TikTokAccount" RENAME TO "TikTokAccount";
CREATE UNIQUE INDEX "TikTokAccount_openId_key" ON "TikTokAccount"("openId");
CREATE INDEX "TikTokAccount_userId_idx" ON "TikTokAccount"("userId");
CREATE INDEX "TikTokAccount_connectionStatus_idx" ON "TikTokAccount"("connectionStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
