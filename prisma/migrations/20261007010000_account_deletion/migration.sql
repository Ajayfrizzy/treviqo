-- Durable deletion intent and per-object progress; no existing data is removed.
ALTER TABLE "User" ADD COLUMN "deletionStartedAt" TIMESTAMP(3);
ALTER TABLE "EmploymentDocument" ADD COLUMN "storagePurgedAt" TIMESTAMP(3);
