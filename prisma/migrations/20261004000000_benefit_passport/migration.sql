-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('pension', 'hmo', 'group_life', 'employer_specific', 'cooperative', 'provident');

-- CreateEnum
CREATE TYPE "BenefitPortability" AS ENUM ('portable', 'employer_linked', 'unknown');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'benefit_saved';
ALTER TYPE "AuditAction" ADD VALUE 'benefit_removed';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "benefitId" TEXT;

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "category" "BenefitCategory" NOT NULL,
    "classification" "BenefitPortability" NOT NULL DEFAULT 'unknown',
    "sourceDocumentId" TEXT,
    "sourceDocumentUpdatedAt" TIMESTAMP(3),
    "sourceFieldId" TEXT,
    "sourceFieldVersion" INTEGER,
    "contextHash" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Benefit_userId_employmentId_idx" ON "Benefit"("userId", "employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Benefit_employmentId_category_key" ON "Benefit"("employmentId", "category");

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_employmentId_userId_fkey" FOREIGN KEY ("employmentId", "userId") REFERENCES "Employment"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

