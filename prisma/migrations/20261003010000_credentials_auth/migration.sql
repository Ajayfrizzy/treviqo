-- Additive migration: preserve any existing identity rows and stable user IDs.
ALTER TABLE "User" ALTER COLUMN "issuer" DROP NOT NULL,
                   ALTER COLUMN "subject" DROP NOT NULL,
                   ADD COLUMN "email" TEXT,
                   ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
