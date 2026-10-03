CREATE TYPE "DocumentType" AS ENUM ('employment_contract', 'payslip', 'resignation_letter', 'termination_letter', 'exit_letter', 'pension_statement', 'final_settlement', 'reimbursement_evidence', 'benefit_document', 'other');
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'processing', 'ready', 'failed', 'deleting', 'deleted');
CREATE TYPE "AuditAction" AS ENUM ('document_uploaded', 'document_access_issued', 'document_deleted');
CREATE UNIQUE INDEX "Employment_id_userId_key" ON "Employment"("id", "userId");
CREATE TABLE "EmploymentDocument" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "employmentId" TEXT NOT NULL,
 "documentType" "DocumentType" NOT NULL DEFAULT 'other',
 "originalFilename" VARCHAR(255) NOT NULL, "sanitizedFilename" VARCHAR(160) NOT NULL,
 "objectKey" TEXT NOT NULL, "mimeType" VARCHAR(64) NOT NULL, "fileSize" INTEGER NOT NULL,
 "checksum" VARCHAR(64) NOT NULL, "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "EmploymentDocument_objectKey_key" ON "EmploymentDocument"("objectKey");
CREATE INDEX "EmploymentDocument_userId_employmentId_createdAt_idx" ON "EmploymentDocument"("userId", "employmentId", "createdAt");
CREATE INDEX "EmploymentDocument_status_updatedAt_idx" ON "EmploymentDocument"("status", "updatedAt");
ALTER TABLE "EmploymentDocument" ADD CONSTRAINT "EmploymentDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmploymentDocument" ADD CONSTRAINT "EmploymentDocument_employmentId_userId_fkey" FOREIGN KEY ("employmentId", "userId") REFERENCES "Employment"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "AuditEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "documentId" TEXT NOT NULL,
 "employmentId" TEXT NOT NULL, "action" "AuditAction" NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_documentId_action_idx" ON "AuditEvent"("documentId", "action");
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
