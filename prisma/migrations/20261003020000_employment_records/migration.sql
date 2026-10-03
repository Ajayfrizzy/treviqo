CREATE TYPE "EmploymentStatus" AS ENUM ('active', 'exiting', 'closed');
CREATE TYPE "EmploymentType" AS ENUM ('permanent', 'contract', 'temporary', 'internship', 'other');
CREATE TABLE "Employment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "employerName" VARCHAR(160) NOT NULL,
  "roleTitle" VARCHAR(160) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "employmentType" "EmploymentType",
  "status" "EmploymentStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Employment_userId_status_startDate_idx" ON "Employment"("userId", "status", "startDate");
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
