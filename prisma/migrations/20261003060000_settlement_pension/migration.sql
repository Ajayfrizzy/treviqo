-- CreateEnum
CREATE TYPE "SettlementCategory" AS ENUM ('final_salary', 'leave', 'reimbursement', 'bonus', 'pension_deduction', 'loan_deduction', 'other_deduction', 'total');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'settlement_saved';
ALTER TYPE "AuditAction" ADD VALUE 'settlement_removed';
ALTER TYPE "AuditAction" ADD VALUE 'pension_started';
ALTER TYPE "AuditAction" ADD VALUE 'pension_updated';
ALTER TYPE "AuditAction" ADD VALUE 'pension_confirmed';

-- CreateTable
CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "exitCaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "SettlementCategory" NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "documentId" TEXT NOT NULL,
    "expectedFieldId" TEXT NOT NULL,
    "expectedFieldVersion" INTEGER NOT NULL,
    "actualFieldId" TEXT,
    "actualFieldVersion" INTEGER,
    "expectedPeriod" VARCHAR(7) NOT NULL,
    "actualPeriod" VARCHAR(7) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PensionVerification" (
    "id" TEXT NOT NULL,
    "exitCaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetPeriod" VARCHAR(7) NOT NULL,
    "statementRunId" TEXT,
    "expectedFieldId" TEXT,
    "expectedFieldVersion" INTEGER,
    "followUpDate" DATE,
    "confirmedHash" VARCHAR(64),
    "confirmedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PensionVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettlementItem_exitCaseId_userId_idx" ON "SettlementItem"("exitCaseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PensionVerification_exitCaseId_key" ON "PensionVerification"("exitCaseId");

-- CreateIndex
CREATE INDEX "PensionVerification_userId_followUpDate_idx" ON "PensionVerification"("userId", "followUpDate");

-- CreateIndex
CREATE UNIQUE INDEX "PensionVerification_exitCaseId_userId_key" ON "PensionVerification"("exitCaseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExitCase_id_userId_key" ON "ExitCase"("id", "userId");

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_exitCaseId_userId_fkey" FOREIGN KEY ("exitCaseId", "userId") REFERENCES "ExitCase"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PensionVerification" ADD CONSTRAINT "PensionVerification_exitCaseId_userId_fkey" FOREIGN KEY ("exitCaseId", "userId") REFERENCES "ExitCase"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

