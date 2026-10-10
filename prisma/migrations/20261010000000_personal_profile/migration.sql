ALTER TABLE "User"
  ADD COLUMN "firstName" VARCHAR(80),
  ADD COLUMN "lastName" VARCHAR(80),
  ADD COLUMN "preferredName" VARCHAR(80),
  ADD COLUMN "country" VARCHAR(2);

ALTER TYPE "AuditAction" ADD VALUE 'profile_updated';
