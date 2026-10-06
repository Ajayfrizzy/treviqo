-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('exit_action', 'pension_followup', 'missing_document', 'stale_action');

-- CreateEnum
CREATE TYPE "ReminderState" AS ENUM ('active', 'snoozed', 'dismissed', 'resolved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'employment_created';
ALTER TYPE "AuditAction" ADD VALUE 'employment_updated';
ALTER TYPE "AuditAction" ADD VALUE 'employment_closed';
ALTER TYPE "AuditAction" ADD VALUE 'reminder_created';
ALTER TYPE "AuditAction" ADD VALUE 'reminder_changed';
ALTER TYPE "AuditAction" ADD VALUE 'reminder_resolved';
ALTER TYPE "AuditAction" ADD VALUE 'reminder_snoozed';
ALTER TYPE "AuditAction" ADD VALUE 'reminder_dismissed';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "reminderId" TEXT;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exitCaseId" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "state" "ReminderState" NOT NULL DEFAULT 'active',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "snoozedUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cursor" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSucceededAt" TIMESTAMP(3),
    "errorCode" VARCHAR(32),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_state_dueAt_idx" ON "Reminder"("userId", "state", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_exitCaseId_key_key" ON "Reminder"("exitCaseId", "key");

-- CreateIndex
CREATE INDEX "BackgroundJob_state_dueAt_idx" ON "BackgroundJob"("state", "dueAt");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_exitCaseId_userId_fkey" FOREIGN KEY ("exitCaseId", "userId") REFERENCES "ExitCase"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

