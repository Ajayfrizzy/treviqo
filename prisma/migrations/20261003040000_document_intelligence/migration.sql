-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "ExtractionConfidence" AS ENUM ('high', 'medium', 'low', 'needs_review');

-- CreateEnum
CREATE TYPE "FieldReviewState" AS ENUM ('proposed', 'confirmed', 'corrected', 'rejected', 'unknown');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'extraction_started';
ALTER TYPE "AuditAction" ADD VALUE 'extraction_completed';
ALTER TYPE "AuditAction" ADD VALUE 'extraction_failed';
ALTER TYPE "AuditAction" ADD VALUE 'extraction_reviewed';

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'processing',
    "documentType" "DocumentType",
    "sourceKind" VARCHAR(32) NOT NULL,
    "sourceHash" VARCHAR(64),
    "model" VARCHAR(160) NOT NULL,
    "promptVersion" VARCHAR(64) NOT NULL,
    "schemaVersion" VARCHAR(64) NOT NULL,
    "errorCode" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedField" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "proposedValue" VARCHAR(1000),
    "value" VARCHAR(1000),
    "evidence" VARCHAR(1600),
    "confidence" "ExtractionConfidence" NOT NULL,
    "reviewState" "FieldReviewState" NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionFieldRevision" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "state" "FieldReviewState" NOT NULL,
    "value" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionFieldRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentExtraction_userId_documentId_createdAt_idx" ON "DocumentExtraction"("userId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentExtraction_status_createdAt_idx" ON "DocumentExtraction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedField_extractionId_key_key" ON "ExtractedField"("extractionId", "key");

-- CreateIndex
CREATE INDEX "ExtractionFieldRevision_fieldId_createdAt_idx" ON "ExtractionFieldRevision"("fieldId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentDocument_id_userId_key" ON "EmploymentDocument"("id", "userId");

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_userId_fkey" FOREIGN KEY ("documentId", "userId") REFERENCES "EmploymentDocument"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "DocumentExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionFieldRevision" ADD CONSTRAINT "ExtractionFieldRevision_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ExtractedField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

