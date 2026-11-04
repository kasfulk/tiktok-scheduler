-- AlterTable: local vision-model configuration for AI caption generation.
ALTER TABLE "User" ADD COLUMN "aiCaptionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "aiBaseUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434/v1';
ALTER TABLE "User" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "aiApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "aiPrompt" TEXT NOT NULL DEFAULT '';
