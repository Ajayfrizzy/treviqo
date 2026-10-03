-- CreateEnum
CREATE TYPE "ExitType" AS ENUM ('resignation', 'termination', 'redundancy', 'contract_completion', 'retirement');

-- CreateEnum
CREATE TYPE "ExitAnswer" AS ENUM ('unknown', 'yes', 'no');

-- CreateEnum
CREATE TYPE "ExitFollowup" AS ENUM ('unknown', 'none', 'pending', 'resolved');

-- CreateEnum
CREATE TYPE "ExitAssets" AS ENUM ('unknown', 'none', 'held', 'scheduled', 'returned');

-- CreateEnum
CREATE TYPE "ExitReference" AS ENUM ('unknown', 'not_needed', 'not_requested', 'requested', 'saved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'exit_created';
ALTER TYPE "AuditAction" ADD VALUE 'exit_updated';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "exitCaseId" TEXT,
ALTER COLUMN "documentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ExitCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "exitType" "ExitType" NOT NULL,
    "lastWorkingDate" DATE NOT NULL,
    "noticeDate" DATE,
    "noticeApplicable" "ExitAnswer" NOT NULL DEFAULT 'unknown',
    "noticeRequirement" VARCHAR(1000),
    "noticeFieldId" TEXT,
    "noticeFieldVersion" INTEGER,
    "finalPayDocumentId" TEXT,
    "finalPayPeriod" VARCHAR(160),
    "leave" "ExitFollowup" NOT NULL DEFAULT 'unknown',
    "reimbursements" "ExitFollowup" NOT NULL DEFAULT 'unknown',
    "reimbursementDocumentId" TEXT,
    "pension" "ExitAnswer" NOT NULL DEFAULT 'unknown',
    "pensionDetailsSaved" BOOLEAN NOT NULL DEFAULT false,
    "assets" "ExitAssets" NOT NULL DEFAULT 'unknown',
    "assetDocumentId" TEXT,
    "exitDocumentId" TEXT,
    "reference" "ExitReference" NOT NULL DEFAULT 'unknown',
    "referenceDocumentId" TEXT,
    "benefits" "ExitFollowup" NOT NULL DEFAULT 'unknown',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExitCase_employmentId_key" ON "ExitCase"("employmentId");

-- CreateIndex
CREATE INDEX "ExitCase_userId_updatedAt_idx" ON "ExitCase"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ExitCase" ADD CONSTRAINT "ExitCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitCase" ADD CONSTRAINT "ExitCase_employmentId_userId_fkey" FOREIGN KEY ("employmentId", "userId") REFERENCES "Employment"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

