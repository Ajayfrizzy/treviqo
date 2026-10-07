ALTER TABLE "User"
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN "deletionRetryAt" TIMESTAMP(3),
ADD COLUMN "deletionAttempts" INTEGER NOT NULL DEFAULT 0;

-- Legacy partial erasures are already irreversible and must never be cancellable.
UPDATE "User" SET "deletionScheduledFor" = "deletionStartedAt"
WHERE "deletionStartedAt" IS NOT NULL;
CREATE INDEX "User_deletionScheduledFor_deletionRetryAt_idx"
ON "User"("deletionScheduledFor", "deletionRetryAt");

ALTER TABLE "AuditEvent" ALTER COLUMN "employmentId" DROP NOT NULL;
ALTER TYPE "AuditAction" ADD VALUE 'account_deletion_scheduled';
ALTER TYPE "AuditAction" ADD VALUE 'account_deletion_cancelled';
